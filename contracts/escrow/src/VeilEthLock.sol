// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface VeilEthLock needs to escrow the collateral token. On mainnet this is
///         canonical WETH; on Sepolia the demo uses Uniswap's canonical WETH
///         `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` (real wrapped ETH — no mint).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice snarkjs-exported Groth16 verifier for the `deposit_from_eth` opening circuit. Public
///         signals are `[amount, C]`. Returns true iff the proof shows `C` opens to `amount`.
interface IDepositFromEthVerifier {
    function verifyProof(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[2] calldata pubSignals
    ) external view returns (bool);
}

/// @notice Axelar General Message Passing gateway — carries the `(C, amount)` attestation to Soroban.
interface IAxelarGateway {
    function callContract(
        string calldata destinationChain,
        string calldata contractAddress,
        bytes calldata payload
    ) external;
}

/// @notice Axelar gas service — the borrower prepays cross-chain execution gas (in native ETH).
interface IAxelarGasService {
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable;
}

/// @title VeilEthLock
/// @notice Ethereum (Sepolia) collateral leg for Veil v3's trust-minimized cross-chain private lending.
///
///         A borrower locks `amount` real WETH here and supplies an AVAILABLE note commitment `C`. The
///         contract verifies a Groth16 opening proof that `C == NoteCommitment(0x10, amount, spendPk,
///         blinding, 0)` — binding the escrowed amount to the note ON ETHEREUM, where the collateral
///         actually lives, so a user cannot lock less WETH than the note they will borrow against on
///         Stellar (which would drain the USDC LP). It then emits the attestation `(C, amount)` to the
///         Soroban `veil-pool` via **Axelar GMP**: Axelar's decentralized validator set authenticates
///         the message, so the Soroban side inserts `C` into the shielded tree WITHOUT trusting any
///         single relayer or state-root poster. The ETH never leaves Ethereum — only the authenticated
///         commitment + amount cross over, and the shielded borrow proof stays on Stellar.
///
///         Collateral RELEASE (withdraw after a Stellar repay) is future work (a cross-chain
///         settlement message); this contract is lock-only for the v3 demo.
///
/// @dev    L-02 (documented, deferred): `lock` does not bind `msg.sender` into the opening proof, so a
///         mempool observer could copy a pending `(amount, C, proof)` and front-run with their own WETH
///         to win the one-lock-per-`C` slot. This is self-costly griefing only — the attacker cannot
///         spend the resulting note (it needs the victim's `nk`), and the victim simply picks a fresh
///         `blinding` → new `C` and retries. Closing it needs a `msg.sender` public signal (new circuit
///         + ceremony); out of scope for the demo.
contract VeilEthLock {
    IERC20 public immutable weth;
    IDepositFromEthVerifier public immutable verifier;
    IAxelarGateway public immutable gateway;
    IAxelarGasService public immutable gasService;

    /// @notice Deploy-time owner; the only address allowed to set the destination once.
    address public immutable owner;
    /// @notice Axelar's registered chain name for the Soroban destination. SETTABLE (not a constant),
    ///         because Amplifier chain names rotate (e.g. `stellar-2026-q1-2`); pinning it in bytecode
    ///         would force a redeploy on every rotation.
    string public destinationChain;
    /// @notice The Soroban veil-pool address (strkey string) messages are sent to. Set once, after the
    ///         pool is deployed (resolves the pool↔lock address cycle — the pool pins THIS contract's
    ///         address in its constructor, so the pool must exist before we can point at it). Safety
    ///         lives on the Soroban side (veil-pool asserts source_address == this contract); a wrong
    ///         destination here only misroutes gas, it cannot forge a note.
    string public destinationContract;

    struct Lock {
        uint256 amount;
        address owner;
        uint64 blockNumber;
    }

    /// @notice commitment `C` => its lock. `amount == 0` means "not locked" (amount is always > 0).
    mapping(uint256 => Lock) public locks;
    /// @notice Running sum of escrowed collateral (Ethereum-side bookkeeping / transparency).
    uint256 public totalLocked;

    event Locked(uint256 indexed commitment, uint256 amount, address indexed owner);
    event DestinationSet(string destinationChain, string destinationContract);

    error ZeroAmount();
    error CommitmentAlreadyLocked();
    error InvalidOpeningProof();
    error WethTransferFailed();
    error NotOwner();
    error DestinationAlreadySet();
    error DestinationUnset();

    constructor(address weth_, address verifier_, address gateway_, address gasService_) {
        weth = IERC20(weth_);
        verifier = IDepositFromEthVerifier(verifier_);
        gateway = IAxelarGateway(gateway_);
        gasService = IAxelarGasService(gasService_);
        owner = msg.sender;
    }

    /// @notice One-time: point this lock at the deployed Soroban veil-pool via Axelar — the Amplifier
    ///         destination chain name (e.g. `stellar-2026-q1-2`) and the pool's strkey.
    function setDestination(string calldata destinationChain_, string calldata destinationContract_)
        external
    {
        if (msg.sender != owner) revert NotOwner();
        if (bytes(destinationContract).length != 0) revert DestinationAlreadySet();
        destinationChain = destinationChain_;
        destinationContract = destinationContract_;
        emit DestinationSet(destinationChain_, destinationContract_);
    }

    /// @notice Lock `amount` WETH bound to note commitment `C`, and emit the `(C, amount)` attestation
    ///         to the Soroban veil-pool via Axelar. `C` must be fresh (one lock per commitment — else
    ///         Axelar would deliver two mints), the opening proof must show `C` commits to exactly
    ///         `amount`, and `msg.value` prepays the Axelar cross-chain gas (refunded to `msg.sender`).
    function lock(
        uint256 amount,
        uint256 C,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC
    ) external payable {
        if (amount == 0) revert ZeroAmount();
        if (locks[C].amount != 0) revert CommitmentAlreadyLocked();
        if (bytes(destinationContract).length == 0) revert DestinationUnset();

        // Bind C to the locked amount. Public signals in snarkjs order: [amount, C].
        uint[2] memory pub = [amount, C];
        if (!verifier.verifyProof(pA, pB, pC, pub)) revert InvalidOpeningProof();

        // Effects before interaction (a failed transfer reverts the whole call → nothing persists).
        locks[C] = Lock({amount: amount, owner: msg.sender, blockNumber: uint64(block.number)});
        totalLocked += amount;

        if (!weth.transferFrom(msg.sender, address(this), amount)) revert WethTransferFailed();

        emit Locked(C, amount, msg.sender);

        // Cross-chain attestation: (C, amount) → Soroban veil-pool, authenticated by Axelar.
        bytes memory payload = abi.encode(C, amount);
        if (msg.value > 0) {
            gasService.payNativeGasForContractCall{value: msg.value}(
                address(this), destinationChain, destinationContract, payload, msg.sender
            );
        }
        gateway.callContract(destinationChain, destinationContract, payload);
    }

    function isLocked(uint256 C) external view returns (bool) {
        return locks[C].amount != 0;
    }
}
