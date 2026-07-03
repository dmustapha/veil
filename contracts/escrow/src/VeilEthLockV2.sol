// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface VeilEthLockV2 needs to escrow and release the collateral token.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice snarkjs-exported Groth16 verifier for the `deposit_from_eth` opening circuit.
interface IDepositFromEthVerifier {
    function verifyProof(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[2] calldata pubSignals
    ) external view returns (bool);
}

/// @notice Axelar GMP gateway — outbound callContract + inbound validateContractCall.
///         `validateContractCall` is the classic (pre-Amplifier) method: checks approval and
///         atomically marks the commandId as executed (replay guard on the gateway side).
interface IAxelarGateway {
    function callContract(
        string calldata destinationChain,
        string calldata contractAddress,
        bytes calldata payload
    ) external;

    /// @dev Returns true iff the message was approved and not yet executed; also marks executed.
    ///      Matches the ABI on Sepolia gateway 0xe432150cce91c13a887f7D836923d5597adD8E31.
    function validateContractCall(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash
    ) external returns (bool);
}

/// @notice Axelar gas service — prepays cross-chain execution gas in native ETH.
interface IAxelarGasService {
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable;
}

/// @title VeilEthLockV2
/// @notice Ethereum (Sepolia) collateral leg for Veil v3's trust-minimised cross-chain private lending.
///         Extends VeilEthLock with an Axelar-inbound `execute` that releases C-keyed WETH to the
///         borrower after a verified Stellar repay message arrives through Axelar GMP.
///
///         Lock logic is identical to VeilEthLock (v1, deployed at 0xE114C79D…) and MUST remain
///         backward-compatible. The v1 contract is NOT modified.
///
///         Release flow:
///           Stellar veil-pool emits payload = abi.encode(uint256 C, address recipient)
///           → Axelar validators relay + approve commandId on this gateway
///           → off-chain relayer calls execute(commandId, sourceChain, sourceAddress, payload)
///           → validateContractCall passes (gateway replay-guard) + source pins match
///           → WETH transferred to recipient, Released event emitted.
///
/// @dev    Double-release guard: `released[C]` (contract-level) + gateway's own commandId
///         executed-flag (Axelar-level). Either alone would suffice; both in combination are defence
///         in depth against a gateway upgrade that resets its replay state.
contract VeilEthLockV2 {
    IERC20 public immutable weth;
    IDepositFromEthVerifier public immutable verifier;
    IAxelarGateway public immutable gateway;
    IAxelarGasService public immutable gasService;

    address public immutable owner;

    // --- outbound (lock → Stellar) ---
    string public destinationChain;
    string public destinationContract;

    // --- inbound (Stellar → release) ---
    string public trustedSourceChain;    // e.g. "stellar-2026-q1-2"
    string public trustedSourceAddress;  // the veil-pool strkey, set once after pool deploy

    struct Lock {
        uint256 amount;
        address owner;
        uint64 blockNumber;
    }

    mapping(uint256 => Lock) public locks;   // C => lock record
    mapping(uint256 => bool) public released; // C => released (double-release guard)
    uint256 public totalLocked;

    // --- events ---
    event Locked(uint256 indexed commitment, uint256 amount, address indexed owner);
    event DestinationSet(string destinationChain, string destinationContract);
    event Released(uint256 indexed commitment, address indexed recipient, uint256 amount);

    // --- errors ---
    error ZeroAmount();
    error CommitmentAlreadyLocked();
    error InvalidOpeningProof();
    error WethTransferFailed();
    error NotOwner();
    error DestinationAlreadySet();
    error DestinationUnset();
    error SourceAlreadySet();
    error EmptySource();
    error SourceNotSet();
    error NotApprovedByGateway();
    error UntrustedSource();
    error AlreadyReleased();
    error NothingLocked();

    constructor(address weth_, address verifier_, address gateway_, address gasService_) {
        weth = IERC20(weth_);
        verifier = IDepositFromEthVerifier(verifier_);
        gateway = IAxelarGateway(gateway_);
        gasService = IAxelarGasService(gasService_);
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Outbound: lock WETH, attest (C, amount) to Stellar via Axelar
    // -------------------------------------------------------------------------

    /// @notice One-time: set the Soroban veil-pool destination (Amplifier chain name + strkey).
    function setDestination(string calldata destinationChain_, string calldata destinationContract_)
        external
    {
        if (msg.sender != owner) revert NotOwner();
        if (bytes(destinationContract).length != 0) revert DestinationAlreadySet();
        destinationChain = destinationChain_;
        destinationContract = destinationContract_;
        emit DestinationSet(destinationChain_, destinationContract_);
    }

    /// @notice Lock `amount` WETH bound to note commitment `C` and emit (C, amount) to Stellar.
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

        uint[2] memory pub = [amount, C];
        if (!verifier.verifyProof(pA, pB, pC, pub)) revert InvalidOpeningProof();

        locks[C] = Lock({amount: amount, owner: msg.sender, blockNumber: uint64(block.number)});
        totalLocked += amount;

        if (!weth.transferFrom(msg.sender, address(this), amount)) revert WethTransferFailed();

        emit Locked(C, amount, msg.sender);

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

    // -------------------------------------------------------------------------
    // Inbound: receive Axelar message from Stellar veil-pool, release WETH
    // -------------------------------------------------------------------------

    /// @notice One-time: pin the trusted Stellar veil-pool source (chain name + strkey address).
    ///         Must be called before any repay messages can be processed.
    function setTrustedSource(string calldata chain_, string calldata addr_) external {
        if (msg.sender != owner) revert NotOwner();
        if (bytes(trustedSourceAddress).length != 0) revert SourceAlreadySet();
        if (bytes(chain_).length == 0 || bytes(addr_).length == 0) revert EmptySource();
        trustedSourceChain = chain_;
        trustedSourceAddress = addr_;
    }

    /// @notice Axelar executable entry — release C-keyed WETH to `recipient` after a Stellar repay.
    ///         Called by the Axelar relayer after the Stellar veil-pool emits the repay message.
    ///         payload = abi.encode(uint256 C, address recipient)  (64 bytes: 32 C + 32 addr)
    function execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external {
        // 0. Defense-in-depth: trusted source must have been configured by owner.
        if (bytes(trustedSourceAddress).length == 0) revert SourceNotSet();

        // 1. Gateway approval check (also marks commandId as executed — Axelar replay guard).
        bytes32 payloadHash = keccak256(payload);
        if (!gateway.validateContractCall(commandId, sourceChain, sourceAddress, payloadHash))
            revert NotApprovedByGateway();

        // 2. Source pin: only accept messages from the known Stellar veil-pool.
        if (
            keccak256(bytes(sourceChain)) != keccak256(bytes(trustedSourceChain))
                || keccak256(bytes(sourceAddress)) != keccak256(bytes(trustedSourceAddress))
        ) revert UntrustedSource();

        // 3. Decode: Stellar pool sends abi.encode(uint256 C, address recipient).
        (uint256 C, address recipient) = abi.decode(payload, (uint256, address));

        // 4. Contract-level double-release guard.
        if (released[C]) revert AlreadyReleased();

        // 5. Sanity: commitment must have been locked.
        Lock memory l = locks[C];
        if (l.amount == 0) revert NothingLocked();

        // 6. Effects before interaction (CEI pattern).
        released[C] = true;
        totalLocked -= l.amount;

        // 7. Release.
        if (!weth.transfer(recipient, l.amount)) revert WethTransferFailed();
        emit Released(C, recipient, l.amount);
    }

    function isReleased(uint256 C) external view returns (bool) {
        return released[C];
    }
}
