// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilPool, IRiscZeroVerifier} from "../src/VeilPool.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";

bytes32 constant LOCK_IMG = bytes32(uint256(0xABCD));

/// @dev Mock RISC Zero verifier: accepts iff the seal equals the journal digest (binds proof
///      to journal, so a tampered journal fails — mirrors the real cryptographic binding).
contract MockRiscZeroVerifier is IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32, bytes32 journalDigest) external pure {
        bytes32 s;
        require(seal.length == 32, "bad seal len");
        assembly {
            s := calldataload(seal.offset)
        }
        require(s == journalDigest, "bad proof");
    }
}

/// @dev Exposes the internal nullifier helper so the set can be exercised directly. Test infra only.
contract VeilPoolHarness is VeilPool {
    constructor(uint32 levels_, IRiscZeroVerifier v_) VeilPool(levels_, v_, LOCK_IMG) {}

    function exposed_markNullifier(bytes32 nf) external {
        _markNullifier(nf);
    }
}

contract VeilPoolTest is Test {
    // Canonical SHA-256 all-zero subtree roots (identical to the eth2 deposit
    // contract's `zerohashes`). zeros[i] = sha256(zeros[i-1] ++ zeros[i-1]),
    // zeros[0] = bytes32(0). External ground truth for the hash construction.
    bytes32 constant Z0 = bytes32(0);
    bytes32 constant Z1 = 0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b;
    bytes32 constant Z2 = 0xdb56114e00fdd4c1f85c892bf35ac9a89289aaecb1ebd0a96cde606a748b5d71;
    bytes32 constant Z3 = 0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c;

    event Commitment(bytes32 indexed commitment, uint32 leafIndex, bytes encNote);
    event Locked(bytes32 indexed nullifierIn, bytes32 indexed commitmentOut, bytes32 lockId, uint32 leafIndex);

    MockRiscZeroVerifier internal verifier = new MockRiscZeroVerifier();

    function _deploy(uint32 levels) internal returns (VeilPool) {
        return new VeilPool(levels, verifier, LOCK_IMG);
    }

    function _hash(bytes32 l, bytes32 r) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(l, r));
    }

    /// Build a 128-byte lock journal and the matching mock seal (= its sha256 digest).
    function _lockJournal(bytes32 root, bytes32 nfIn, bytes32 cOut, bytes32 lockId)
        internal
        pure
        returns (bytes memory journal, bytes memory seal)
    {
        journal = abi.encodePacked(root, nfIn, cOut, lockId);
        seal = abi.encodePacked(sha256(journal));
    }

    function test_ZeroHashesMatchSha256Standard() public {
        VeilPool pool = _deploy(4);
        assertEq(pool.zeros(0), Z0, "z0");
        assertEq(pool.zeros(1), Z1, "z1");
        assertEq(pool.zeros(2), Z2, "z2");
        assertEq(pool.zeros(3), Z3, "z3");
    }

    function test_EmptyRootIsZerosAtLevels() public {
        VeilPool pool = _deploy(4);
        // Root of an empty depth-4 tree is the all-zero subtree root of height 4.
        bytes32 z4 = _hash(Z3, Z3);
        assertEq(pool.getLastRoot(), z4, "empty root");
        assertTrue(pool.isKnownRoot(z4), "empty root known");
    }

    function test_DepositInsertsAndEmits() public {
        VeilPool pool = _deploy(16);
        bytes32 c = keccak256("commitment-1");
        bytes memory enc = hex"deadbeef";

        vm.expectEmit(true, false, false, true);
        emit Commitment(c, 0, enc);
        uint32 idx = pool.deposit(c, enc);

        assertEq(idx, 0, "first leaf index");
        assertEq(pool.nextIndex(), 1, "nextIndex advanced");
    }

    function test_DepositIncrementsLeafIndex() public {
        VeilPool pool = _deploy(16);
        uint32 i0 = pool.deposit(keccak256("a"), "");
        uint32 i1 = pool.deposit(keccak256("b"), "");
        assertEq(i0, 0, "leaf 0");
        assertEq(i1, 1, "leaf 1");
        assertEq(pool.nextIndex(), 2, "nextIndex");
    }

    function test_DepositUpdatesRootAndKeepsHistory() public {
        VeilPool pool = _deploy(16);
        bytes32 emptyRoot = pool.getLastRoot();

        pool.deposit(keccak256("a"), "");
        bytes32 newRoot = pool.getLastRoot();

        assertTrue(newRoot != emptyRoot, "root changed");
        assertTrue(pool.isKnownRoot(newRoot), "new root known");
        assertTrue(pool.isKnownRoot(emptyRoot), "old root still in history");
    }

    function test_UnknownRootRejected() public {
        VeilPool pool = _deploy(16);
        assertTrue(!pool.isKnownRoot(keccak256("never inserted")), "random root unknown");
        assertTrue(!pool.isKnownRoot(bytes32(0)), "zero never known");
    }

    function test_RootMatchesIndependentComputation() public {
        // depth-2 tree, single leaf at index 0:
        // level0: [L, z0, z0, z0] -> node = hash(L, z0)
        // level1: hash(node, z1)
        VeilPool pool = _deploy(2);
        bytes32 leaf = keccak256("the-only-note");
        pool.deposit(leaf, "");

        bytes32 expected = _hash(_hash(leaf, Z0), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 single-leaf root");
    }

    function test_CrossImplRootVector() public {
        // SHARED CROSS-IMPL VECTOR: leaf = 0xCD..CD, depth-2, index 0, empty siblings.
        // The RISC Zero borrow guest (veil-core notes::merkle_root_matches_canonical_empty_siblings)
        // asserts this identical literal. Any drift between contract and guest breaks one side.
        VeilPool pool = _deploy(2);
        // leaf = 0xCDCD..CD (byte 0xCD repeated 32x) == 0xCD * 0x0101..01
        bytes32 leaf = bytes32(uint256(0xCD) * (type(uint256).max / 0xFF));
        pool.deposit(leaf, "");
        assertEq(
            pool.getLastRoot(),
            0xe7a935fd4370e33243b4b66fe104dbee170db86603e4a0845d6bb491d0187a44,
            "Solidity root drifted from the shared cross-impl vector"
        );
    }

    function test_TwoLeavesRootMatchesIndependentComputation() public {
        // depth-2 tree, leaves L0,L1 share the same level-0 parent:
        // node01 = hash(L0, L1); root = hash(node01, z1)
        VeilPool pool = _deploy(2);
        bytes32 l0 = keccak256("note-0");
        bytes32 l1 = keccak256("note-1");
        pool.deposit(l0, "");
        pool.deposit(l1, "");

        bytes32 expected = _hash(_hash(l0, l1), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 two-leaf root");
    }

    function test_TreeFullReverts() public {
        // depth-2 tree has capacity 2^2 = 4 leaves.
        VeilPool pool = _deploy(2);
        pool.deposit(keccak256("0"), "");
        pool.deposit(keccak256("1"), "");
        pool.deposit(keccak256("2"), "");
        pool.deposit(keccak256("3"), "");
        vm.expectRevert(MerkleTreeWithHistory.TreeFull.selector);
        pool.deposit(keccak256("4"), "");
    }

    function test_MarkNullifierThenSpent() public {
        VeilPoolHarness pool = new VeilPoolHarness(16, verifier);
        bytes32 nf = keccak256("nullifier-1");
        assertTrue(!pool.isSpent(nf), "unspent before");
        pool.exposed_markNullifier(nf);
        assertTrue(pool.isSpent(nf), "spent after");
    }

    function test_MarkNullifierTwiceReverts() public {
        VeilPoolHarness pool = new VeilPoolHarness(16, verifier);
        bytes32 nf = keccak256("nullifier-1");
        pool.exposed_markNullifier(nf);
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.exposed_markNullifier(nf);
    }

    function test_HashLeftRightIsSha256() public {
        VeilPool pool = _deploy(4);
        bytes32 l = keccak256("L");
        bytes32 r = keccak256("R");
        assertEq(pool.hashLeftRight(l, r), sha256(abi.encodePacked(l, r)), "hash == sha256(l||r)");
    }

    // ---- lock joinsplit (item 4) ----

    function test_LockSpendsInputAndInsertsLockedNote() public {
        VeilPool pool = _deploy(16);
        // An AVAILABLE note exists, producing a known root to prove against.
        pool.deposit(keccak256("available-note"), "");
        bytes32 root = pool.getLastRoot();

        bytes32 nfIn = keccak256("nullifier-in");
        bytes32 cOut = keccak256("locked-note-out");
        bytes32 lockId = keccak256("lock-1");
        (bytes memory journal, bytes memory seal) = _lockJournal(root, nfIn, cOut, lockId);

        vm.expectEmit(true, true, false, true);
        emit Locked(nfIn, cOut, lockId, 1);
        uint32 idx = pool.lock(seal, journal, "");

        assertEq(idx, 1, "locked note is the second leaf");
        assertTrue(pool.isSpent(nfIn), "input nullifier spent");
        assertEq(pool.nextIndex(), 2, "tree advanced");
    }

    function test_LockUnknownRootReverts() public {
        VeilPool pool = _deploy(16);
        bytes32 badRoot = keccak256("not a real root");
        (bytes memory journal, bytes memory seal) =
            _lockJournal(badRoot, keccak256("n"), keccak256("c"), keccak256("l"));
        vm.expectRevert(VeilPool.UnknownRoot.selector);
        pool.lock(seal, journal, "");
    }

    function test_LockBadProofReverts() public {
        VeilPool pool = _deploy(16);
        pool.deposit(keccak256("available-note"), "");
        bytes32 root = pool.getLastRoot();
        (bytes memory journal,) = _lockJournal(root, keccak256("n"), keccak256("c"), keccak256("l"));
        bytes memory badSeal = abi.encodePacked(keccak256("wrong")); // != sha256(journal)
        vm.expectRevert(bytes("bad proof"));
        pool.lock(badSeal, journal, "");
    }

    function test_LockDoubleSpendReverts() public {
        VeilPool pool = _deploy(16);
        pool.deposit(keccak256("available-note"), "");
        bytes32 root = pool.getLastRoot();
        bytes32 nfIn = keccak256("nullifier-in");
        (bytes memory j1, bytes memory s1) = _lockJournal(root, nfIn, keccak256("c1"), keccak256("l1"));
        pool.lock(s1, j1, "");

        // reuse the same input nullifier (prove against a still-known root)
        bytes32 root2 = pool.getLastRoot();
        (bytes memory j2, bytes memory s2) = _lockJournal(root2, nfIn, keccak256("c2"), keccak256("l2"));
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.lock(s2, j2, "");
    }

    function test_LockBadJournalLengthReverts() public {
        VeilPool pool = _deploy(16);
        bytes memory shortJournal = hex"deadbeef";
        vm.expectRevert(VeilPool.BadLockJournalLength.selector);
        pool.lock(hex"00", shortJournal, "");
    }
}
