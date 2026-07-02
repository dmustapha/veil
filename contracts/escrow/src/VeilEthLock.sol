// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface VeilEthLock needs to escrow the collateral token (WETH / the
///         MockWstETH stand-in on testnet).
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

/// @title VeilEthLock
/// @notice Ethereum (Sepolia) collateral leg for Veil v3's cross-chain private lending.
///
///         A borrower locks `amount` WETH here and supplies an AVAILABLE note commitment `C`. The
///         contract verifies a Groth16 opening proof that `C == NoteCommitment(0x10, amount, spendPk,
///         blinding, 0)` — binding the escrowed amount to the note ON ETHEREUM, where the collateral
///         actually lives, so a user cannot lock less WETH than the note they will borrow against on
///         Stellar (which would drain the USDC LP). A relayer then mirrors each `Locked` event into
///         the Soroban `veil-pool` (`attest_lock`), where `C` enters the shielded tree and the
///         private borrow proceeds. The ETH never leaves Ethereum — only the commitment + amount
///         (via the relayer) and the shielded borrow proof (on Stellar) cross over.
///
///         Collateral RELEASE (withdraw after a Stellar repay) is future work (a cross-chain
///         settlement proof); this contract is lock-only for the v3 demo.
contract VeilEthLock {
    IERC20 public immutable weth;
    IDepositFromEthVerifier public immutable verifier;

    struct Lock {
        uint256 amount;
        address owner;
        uint64 blockNumber;
    }

    /// @notice commitment `C` => its lock. `amount == 0` means "not locked" (amount is always > 0).
    mapping(uint256 => Lock) public locks;
    /// @notice Running sum of escrowed collateral (mirrors the Soroban pool's solvency floor).
    uint256 public totalLocked;

    event Locked(uint256 indexed commitment, uint256 amount, address indexed owner);

    error ZeroAmount();
    error CommitmentAlreadyLocked();
    error InvalidOpeningProof();
    error WethTransferFailed();

    constructor(address weth_, address verifier_) {
        weth = IERC20(weth_);
        verifier = IDepositFromEthVerifier(verifier_);
    }

    /// @notice Lock `amount` WETH bound to the note commitment `C`. `C` must be fresh (one lock per
    ///         commitment — else a relayer would attest it twice → double-mint on Stellar), and the
    ///         opening proof must show `C` commits to exactly `amount`.
    function lock(
        uint256 amount,
        uint256 C,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (locks[C].amount != 0) revert CommitmentAlreadyLocked();

        // Bind C to the locked amount. Public signals in snarkjs order: [amount, C].
        uint[2] memory pub = [amount, C];
        if (!verifier.verifyProof(pA, pB, pC, pub)) revert InvalidOpeningProof();

        // Effects before interaction (a failed transfer reverts the whole call → nothing persists).
        locks[C] = Lock({amount: amount, owner: msg.sender, blockNumber: uint64(block.number)});
        totalLocked += amount;

        if (!weth.transferFrom(msg.sender, address(this), amount)) revert WethTransferFailed();

        emit Locked(C, amount, msg.sender);
    }

    function isLocked(uint256 C) external view returns (bool) {
        return locks[C].amount != 0;
    }
}
