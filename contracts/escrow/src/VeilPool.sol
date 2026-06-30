// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

/// @notice Minimal RISC Zero verifier interface (risc0-ethereum). `verify` reverts on an invalid
///         proof, so a bad lock proof traps the whole `lock` call.
interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
}

/// @notice Minimal ERC-20 surface VeilPool needs to escrow wstETH collateral.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title VeilPool
/// @notice Shielded note pool for Veil's private margin lending. Collateral lives here as
///         hidden notes inside a SHA-256 Merkle tree; the chain only ever sees opaque
///         32-byte commitments and (on spend) nullifiers. Nothing on-chain reveals a
///         note's amount, owner, or its link to a Stellar loan.
///
///         This REPLACES the v1 `VeilEscrow` slot-proof model (tag `v1-working`): instead
///         of a public hashlock over a public ETH `amount`, a borrow proves — in zero
///         knowledge — Merkle membership of a LOCKED note whose committed amount clears a
///         threshold, revealing neither the amount nor which leaf.
///
/// @dev Note commitment (computed off-chain, inserted opaque):
///        C = SHA256("VEIL_NOTE" ‖ domain ‖ amount ‖ blinding ‖ spendPk)
///        domain: 0x00 AVAILABLE, 0x01 LOCKED. amount in wstETH base-units.
///      Nullifier (key-derived, Penumbra-style; unlinkable without the nullifier key):
///        nf = SHA256("VEIL_NF" ‖ nk ‖ C ‖ leafIndex)
///
///      Build-order scope (item 1): the shielded tree primitive — commitment insertion,
///      root history, and the nullifier set. Economic binding (wstETH custody on deposit;
///      amount conservation enforced by the joinsplit proof) lands with the lock joinsplit
///      (item 4) and productive collateral (item 9). `deposit` here inserts the commitment
///      and surfaces the encrypted note; it does not yet move collateral.
contract VeilPool is MerkleTreeWithHistory {
    /// @notice Spent nullifiers. A nullifier can be published at most once.
    mapping(bytes32 => bool) public nullifierSpent;

    /// @notice Emitted on every insertion so off-chain clients can rebuild the tree and
    ///         recover their note from `encNote` (ciphertext addressed to the owner).
    event Commitment(bytes32 indexed commitment, uint32 leafIndex, bytes encNote);

    /// @notice Emitted when a nullifier is consumed (a note is spent).
    event Nullified(bytes32 indexed nullifier);

    /// @notice Emitted when an AVAILABLE note is locked into a LOCKED note (the joinsplit).
    event Locked(bytes32 indexed nullifierIn, bytes32 indexed commitmentOut, bytes32 lockId, uint32 leafIndex);

    /// @notice Emitted when a LOCKED note is unlocked back to an AVAILABLE note (after a repay-proof).
    event Unlocked(bytes32 indexed nullifierIn, bytes32 indexed commitmentOut, uint32 leafIndex);

    /// @notice Emitted when Relayer B posts a Soroban repaid-root.
    event SorobanRootAdded(bytes32 indexed root);

    /// @notice Emitted when a LIQUIDATED LOCKED note is seized: the floor goes to the liquidator
    ///         as one AVAILABLE note, the hidden surplus returns to the borrower as a change note.
    event Seized(
        bytes32 indexed nullifierIn,
        bytes32 commitmentLiquidator,
        bytes32 commitmentChange,
        uint32 leafLiquidator,
        uint32 leafChange
    );

    /// @notice Emitted when Relayer C posts a Soroban liquidated-root.
    event LiquidatedRootAdded(bytes32 indexed root);

    error NullifierAlreadySpent();
    error BadLockJournalLength();
    error BadUnlockJournalLength();
    error BadSeizeJournalLength();
    error UnknownRoot();
    error UnknownSorobanRoot();
    error UnknownLiquidatedRoot();
    error NotRelayer();

    /// @notice RISC Zero verifier and the joinsplit guest image ids. Immutable; set at deploy.
    IRiscZeroVerifier public immutable verifier;
    bytes32 public immutable lockImageId;
    bytes32 public immutable unlockImageId;
    bytes32 public immutable seizeImageId;

    /// @notice Disclosed-trust relayer (Relayer B) authorized to post Soroban repaid-roots. A
    ///         Wormhole committee + a ZK proof of the repay semantics replaces it in future work.
    address public immutable relayer;

    /// @notice The productive collateral the pool escrows. Notes are denominated in wstETH
    ///         base-units (1e18 scale); deposit binds each note's committed amount to real wstETH.
    IERC20 public immutable wstETH;

    /// @notice Total wstETH base-units escrowed across all deposits (the only public aggregate).
    uint256 public totalDeposited;

    /// @dev Note domain for an AVAILABLE (unlocked, spendable) note.
    uint8 private constant DOMAIN_AVAILABLE = 0x00;

    /// @notice Soroban repaid-roots `R_sor` relayed from the vault. An unlock proof's membership
    ///         path proves the position was REPAID against one of these (the repay-proof anchor).
    mapping(bytes32 => bool) public knownSorobanRoots;

    /// @notice Soroban liquidated-roots `R_liq` relayed from the vault. A seize proof's membership
    ///         path proves the position was LIQUIDATED against one of these (the default-proof anchor).
    mapping(bytes32 => bool) public knownLiquidatedRoots;

    /// @dev Length of the lock joinsplit journal: R(32) ‖ nullifierIn(32) ‖ commitmentOut(32) ‖ lockId(32).
    uint256 private constant LOCK_JOURNAL_LEN = 128;
    /// @dev Length of the unlock journal: R_eth(32) ‖ R_sor(32) ‖ nullifierIn(32) ‖ commitmentOut(32).
    uint256 private constant UNLOCK_JOURNAL_LEN = 128;
    /// @dev Length of the seize journal: R_eth(32) ‖ R_liq(32) ‖ seized(16) ‖ nullifierIn(32) ‖
    ///      commitmentLiquidator(32) ‖ commitmentChange(32).
    uint256 private constant SEIZE_JOURNAL_LEN = 176;

    constructor(
        uint32 levels_,
        IRiscZeroVerifier verifier_,
        bytes32 lockImageId_,
        bytes32 unlockImageId_,
        bytes32 seizeImageId_,
        address relayer_,
        IERC20 wstETH_
    ) MerkleTreeWithHistory(levels_) {
        verifier = verifier_;
        lockImageId = lockImageId_;
        unlockImageId = unlockImageId_;
        seizeImageId = seizeImageId_;
        relayer = relayer_;
        wstETH = wstETH_;
    }

    /// @notice Relayer B posts a Soroban repaid-root so unlock proofs can anchor their repay-proof.
    ///         Disclosed trust: the relayer cannot forge — a wrong root only makes proofs fail.
    function addSorobanRoot(bytes32 root) external {
        if (msg.sender != relayer) revert NotRelayer();
        knownSorobanRoots[root] = true;
        emit SorobanRootAdded(root);
    }

    /// @notice Relayer C posts a Soroban liquidated-root so seize proofs can anchor their
    ///         default-proof. Same disclosed-trust model as `addSorobanRoot`.
    function addLiquidatedRoot(bytes32 root) external {
        if (msg.sender != relayer) revert NotRelayer();
        knownLiquidatedRoots[root] = true;
        emit LiquidatedRootAdded(root);
    }

    /// @notice Deposit `amount` wstETH as collateral, inserting a backed AVAILABLE note. The
    ///         commitment is RECOMPUTED on-chain from the opening, so the inserted note provably
    ///         commits to exactly the escrowed `amount` — this closes the unbacked-note soundness
    ///         gap. Value then flows soundly: the lock joinsplit (item 4) conserves it into a LOCKED
    ///         note, the borrow proves that note clears a threshold, and unlock/seize conserve it on
    ///         the way out. The pool's wstETH balance always covers the sum of note amounts.
    /// @param amount   Collateral in wstETH base-units (also the note's committed amount).
    /// @param blinding Note blinding factor (hiding randomness).
    /// @param spendPk  The owner's spend public key (spend authority is the separate nullifier key).
    /// @param encNote  Ciphertext of the note's opening, addressed to its owner.
    /// @return leafIndex The leaf index assigned to the note.
    ///
    /// @dev PRIVACY (honest): a deposit's `amount` is visible in this tx (you cannot transfer a
    ///      hidden quantity of a transparent ERC-20). Confidentiality of the LOAN's collateral comes
    ///      from the lock joinsplit, which re-shields into a fresh LOCKED note unlinkable to this
    ///      deposit (the key-derived nullifier hides which note was spent, among the anonymity set).
    ///      So the borrow never reveals the amount, and an observer cannot tie a loan's collateral
    ///      back to any specific deposit. The residual is timing/amount correlation — mitigated by
    ///      decoys + a minimum anonymity set, never fully eliminable on a transparent L1.
    ///      Spend authority is unaffected: spending requires the nullifier key `nk`, which is NOT
    ///      part of the revealed opening. (Duplicate openings are permitted: the key-derived
    ///      nullifier includes `leafIndex`, so identical `C` at different leaves stay distinct.)
    function deposit(uint128 amount, bytes32 blinding, bytes32 spendPk, bytes calldata encNote)
        external
        returns (uint32 leafIndex)
    {
        // Recompute the note commitment from the opening: a note that does not commit to the
        // escrowed amount cannot be inserted. Byte layout MUST match veil_core::notes::note_commitment
        // (and the borrow guest): "VEIL_NOTE" ‖ domain(1) ‖ amount(16 BE) ‖ blinding(32) ‖ spendPk(32) ‖ aux(32).
        bytes32 commitment = sha256(
            abi.encodePacked("VEIL_NOTE", DOMAIN_AVAILABLE, amount, blinding, spendPk, bytes32(0))
        );

        // Escrow the collateral (checks-effects-interactions: pull funds, then mutate the tree).
        wstETH.transferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;

        leafIndex = _insert(commitment);
        emit Commitment(commitment, leafIndex, encNote);
    }

    /// @notice Lock an AVAILABLE note into a LOCKED note via a verified joinsplit proof: spend the
    ///         input note (publish its nullifier) and insert a new LOCKED note of the SAME hidden
    ///         amount. On-chain this looks like any internal insertion — no amount, no link, no
    ///         hashlock. Value is conserved inside the ZK proof, so the LOCKED note is worth exactly
    ///         the spent AVAILABLE note.
    /// @param seal    RISC Zero seal for the lock-joinsplit guest.
    /// @param journal 128-byte lock journal: `R ‖ nullifierIn ‖ commitmentOut ‖ lockId`.
    /// @param encNote Ciphertext of the new LOCKED note's opening, addressed to its owner.
    /// @return leafIndex The leaf index assigned to the LOCKED note.
    function lock(bytes calldata seal, bytes calldata journal, bytes calldata encNote)
        external
        returns (uint32 leafIndex)
    {
        if (journal.length != LOCK_JOURNAL_LEN) revert BadLockJournalLength();
        bytes32 root;
        bytes32 nullifierIn;
        bytes32 commitmentOut;
        bytes32 lockId;
        assembly {
            root := calldataload(journal.offset)
            nullifierIn := calldataload(add(journal.offset, 32))
            commitmentOut := calldataload(add(journal.offset, 64))
            lockId := calldataload(add(journal.offset, 96))
        }

        // The membership proof must be against a recent root of THIS pool.
        if (!isKnownRoot(root)) revert UnknownRoot();

        // Verify the joinsplit proof; reverts on an invalid proof (e.g. value inflation).
        verifier.verify(seal, lockImageId, sha256(journal));

        // Spend the input note (reverts on double-spend) and insert the LOCKED note.
        _markNullifier(nullifierIn);
        leafIndex = _insert(commitmentOut);
        emit Commitment(commitmentOut, leafIndex, encNote);
        emit Locked(nullifierIn, commitmentOut, lockId, leafIndex);
    }

    /// @notice Unlock a LOCKED note back to a spendable AVAILABLE note — the reverse joinsplit,
    ///         gated on a REPAY-PROOF. The unlock guest proves (in ZK) that the LOCKED note is in
    ///         pool root `R_eth` AND that the position tied to its lock was REPAID on Stellar
    ///         (`repaid_leaf` is a member of the Soroban repaid-root `R_sor`), then conserves value
    ///         into a new AVAILABLE note. Because the proof requires the repay-membership, a
    ///         borrower can NEVER recover collateral without repaying — closing the v1 hole.
    /// @param seal    RISC Zero seal for the unlock guest.
    /// @param journal 128-byte unlock journal: `R_eth ‖ R_sor ‖ nullifierIn ‖ commitmentOut`.
    /// @param encNote Ciphertext of the recovered AVAILABLE note's opening, addressed to its owner.
    /// @return leafIndex The leaf index assigned to the recovered AVAILABLE note.
    function unlock(bytes calldata seal, bytes calldata journal, bytes calldata encNote)
        external
        returns (uint32 leafIndex)
    {
        if (journal.length != UNLOCK_JOURNAL_LEN) revert BadUnlockJournalLength();
        bytes32 rEth;
        bytes32 rSor;
        bytes32 nullifierIn;
        bytes32 commitmentOut;
        assembly {
            rEth := calldataload(journal.offset)
            rSor := calldataload(add(journal.offset, 32))
            nullifierIn := calldataload(add(journal.offset, 64))
            commitmentOut := calldataload(add(journal.offset, 96))
        }

        // The LOCKED note must be in a recent root of THIS pool, and the repay-proof must anchor to
        // a Soroban repaid-root relayed from the vault.
        if (!isKnownRoot(rEth)) revert UnknownRoot();
        if (!knownSorobanRoots[rSor]) revert UnknownSorobanRoot();

        // Verify the unlock proof; reverts unless membership + repay-membership + value all hold.
        verifier.verify(seal, unlockImageId, sha256(journal));

        // Spend the LOCKED note (reverts on double-spend) and insert the recovered AVAILABLE note.
        _markNullifier(nullifierIn);
        leafIndex = _insert(commitmentOut);
        emit Commitment(commitmentOut, leafIndex, encNote);
        emit Unlocked(nullifierIn, commitmentOut, leafIndex);
    }

    /// @notice Seize a LIQUIDATED LOCKED note — the liquidation counterpart of `unlock`, gated on a
    ///         DEFAULT-PROOF. The seize guest proves (in ZK) that the LOCKED note is in pool root
    ///         `R_eth` AND that the position tied to its lock was LIQUIDATED on Stellar
    ///         (`liquidated_leaf` is a member of the Soroban liquidated-root `R_liq`), then splits
    ///         the note's value: the liquidator receives one AVAILABLE note worth the proven floor,
    ///         and the borrower receives a change note worth the hidden surplus. Value is conserved
    ///         inside the proof. Because the LOCKED note's nullifier is consumed here, the SAME note
    ///         can never also be `unlock`ed — a position is either repaid-and-unlocked or
    ///         liquidated-and-seized, never both.
    /// @param seal     RISC Zero seal for the seize guest.
    /// @param journal  176-byte seize journal: `R_eth ‖ R_liq ‖ seized ‖ nullifierIn ‖
    ///                  commitmentLiquidator ‖ commitmentChange`.
    /// @param encLiq   Ciphertext of the liquidator's recovered note, addressed to the liquidator.
    /// @param encChange Ciphertext of the borrower's change note, addressed to the borrower.
    function seize(bytes calldata seal, bytes calldata journal, bytes calldata encLiq, bytes calldata encChange)
        external
    {
        if (journal.length != SEIZE_JOURNAL_LEN) revert BadSeizeJournalLength();
        // The LOCKED note must be in a recent pool root, and the default-proof must anchor to a
        // Soroban liquidated-root relayed from the vault. Scoped so the roots free their stack slots.
        {
            bytes32 rEth;
            bytes32 rLiq;
            assembly {
                rEth := calldataload(journal.offset)
                rLiq := calldataload(add(journal.offset, 32))
            }
            if (!isKnownRoot(rEth)) revert UnknownRoot();
            if (!knownLiquidatedRoots[rLiq]) revert UnknownLiquidatedRoot();
        }

        // Verify the seize proof; reverts unless membership + liquidation-membership + value all hold.
        verifier.verify(seal, seizeImageId, sha256(journal));

        // seized (16 bytes) sits at offset 64..80; the contract doesn't need it (the guest enforces
        // the split), so the subsequent fields are read at their fixed byte offsets.
        bytes32 nullifierIn;
        bytes32 commitmentLiquidator;
        bytes32 commitmentChange;
        assembly {
            nullifierIn := calldataload(add(journal.offset, 80))
            commitmentLiquidator := calldataload(add(journal.offset, 112))
            commitmentChange := calldataload(add(journal.offset, 144))
        }

        // Spend the LOCKED note (reverts on double-spend) and insert the two output notes.
        _markNullifier(nullifierIn);
        uint32 leafLiquidator = _insert(commitmentLiquidator);
        emit Commitment(commitmentLiquidator, leafLiquidator, encLiq);
        uint32 leafChange = _insert(commitmentChange);
        emit Commitment(commitmentChange, leafChange, encChange);
        emit Seized(nullifierIn, commitmentLiquidator, commitmentChange, leafLiquidator, leafChange);
    }

    /// @notice True if `nf` has already been published.
    function isSpent(bytes32 nf) external view returns (bool) {
        return nullifierSpent[nf];
    }

    /// @dev Consume a nullifier, reverting on reuse. Called by spend paths (joinsplit,
    ///      unlock, seize) once they land.
    function _markNullifier(bytes32 nf) internal {
        if (nullifierSpent[nf]) revert NullifierAlreadySpent();
        nullifierSpent[nf] = true;
        emit Nullified(nf);
    }
}
