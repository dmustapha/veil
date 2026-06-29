// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

/// @notice Minimal RISC Zero verifier interface (risc0-ethereum). `verify` reverts on an invalid
///         proof, so a bad lock proof traps the whole `lock` call.
interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
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

    error NullifierAlreadySpent();
    error BadLockJournalLength();
    error UnknownRoot();

    /// @notice RISC Zero verifier and the lock-joinsplit guest image id. Immutable; set at deploy.
    IRiscZeroVerifier public immutable verifier;
    bytes32 public immutable lockImageId;

    /// @dev Length of the lock joinsplit journal: R(32) ‖ nullifierIn(32) ‖ commitmentOut(32) ‖ lockId(32).
    uint256 private constant LOCK_JOURNAL_LEN = 128;

    constructor(uint32 levels_, IRiscZeroVerifier verifier_, bytes32 lockImageId_)
        MerkleTreeWithHistory(levels_)
    {
        verifier = verifier_;
        lockImageId = lockImageId_;
    }

    /// @notice Insert a note commitment into the shielded tree.
    /// @param commitment The opaque SHA-256 note commitment `C`.
    /// @param encNote    Ciphertext of the note's opening, addressed to its owner.
    /// @return leafIndex The leaf index assigned to `commitment`.
    ///
    /// @dev ⚠️ SOUNDNESS — NOT YET BACKED BY COLLATERAL. In this build-order stage `deposit`
    ///      inserts a commitment with NO wstETH transfer, so a note's committed `amount` is
    ///      unverified. The borrow guest trusts that amount, therefore the pool is NOT
    ///      economically sound until: (item 4) the lock joinsplit conserves value across a
    ///      ZK proof, and (item 9) deposit escrows real wstETH equal to the note amount. Do
    ///      NOT deploy for value-bearing use before those land. (Duplicate commitments are
    ///      permitted: the key-derived nullifier includes `leafIndex`, so identical `C` at
    ///      different leaves still produce distinct nullifiers.)
    function deposit(bytes32 commitment, bytes calldata encNote) external returns (uint32 leafIndex) {
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
