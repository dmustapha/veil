// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilPool} from "../src/VeilPool.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";

/// @dev Exposes the internal nullifier helper so the set can be exercised before the
///      joinsplit spender (build-order item 4) exists. Test infrastructure only.
contract VeilPoolHarness is VeilPool {
    constructor(uint32 levels_) VeilPool(levels_) {}

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

    function _hash(bytes32 l, bytes32 r) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(l, r));
    }

    function test_ZeroHashesMatchSha256Standard() public {
        VeilPool pool = new VeilPool(4);
        assertEq(pool.zeros(0), Z0, "z0");
        assertEq(pool.zeros(1), Z1, "z1");
        assertEq(pool.zeros(2), Z2, "z2");
        assertEq(pool.zeros(3), Z3, "z3");
    }

    function test_EmptyRootIsZerosAtLevels() public {
        VeilPool pool = new VeilPool(4);
        // Root of an empty depth-4 tree is the all-zero subtree root of height 4.
        bytes32 z4 = _hash(Z3, Z3);
        assertEq(pool.getLastRoot(), z4, "empty root");
        assertTrue(pool.isKnownRoot(z4), "empty root known");
    }

    function test_DepositInsertsAndEmits() public {
        VeilPool pool = new VeilPool(16);
        bytes32 c = keccak256("commitment-1");
        bytes memory enc = hex"deadbeef";

        vm.expectEmit(true, false, false, true);
        emit Commitment(c, 0, enc);
        uint32 idx = pool.deposit(c, enc);

        assertEq(idx, 0, "first leaf index");
        assertEq(pool.nextIndex(), 1, "nextIndex advanced");
    }

    function test_DepositIncrementsLeafIndex() public {
        VeilPool pool = new VeilPool(16);
        uint32 i0 = pool.deposit(keccak256("a"), "");
        uint32 i1 = pool.deposit(keccak256("b"), "");
        assertEq(i0, 0, "leaf 0");
        assertEq(i1, 1, "leaf 1");
        assertEq(pool.nextIndex(), 2, "nextIndex");
    }

    function test_DepositUpdatesRootAndKeepsHistory() public {
        VeilPool pool = new VeilPool(16);
        bytes32 emptyRoot = pool.getLastRoot();

        pool.deposit(keccak256("a"), "");
        bytes32 newRoot = pool.getLastRoot();

        assertTrue(newRoot != emptyRoot, "root changed");
        assertTrue(pool.isKnownRoot(newRoot), "new root known");
        assertTrue(pool.isKnownRoot(emptyRoot), "old root still in history");
    }

    function test_UnknownRootRejected() public {
        VeilPool pool = new VeilPool(16);
        assertTrue(!pool.isKnownRoot(keccak256("never inserted")), "random root unknown");
        assertTrue(!pool.isKnownRoot(bytes32(0)), "zero never known");
    }

    function test_RootMatchesIndependentComputation() public {
        // depth-2 tree, single leaf at index 0:
        // level0: [L, z0, z0, z0] -> node = hash(L, z0)
        // level1: hash(node, z1)
        VeilPool pool = new VeilPool(2);
        bytes32 leaf = keccak256("the-only-note");
        pool.deposit(leaf, "");

        bytes32 expected = _hash(_hash(leaf, Z0), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 single-leaf root");
    }

    function test_CrossImplRootVector() public {
        // SHARED CROSS-IMPL VECTOR: leaf = 0xCD..CD, depth-2, index 0, empty siblings.
        // The RISC Zero borrow guest (veil-core notes::merkle_root_matches_canonical_empty_siblings)
        // asserts this identical literal. Any drift between contract and guest breaks one side.
        VeilPool pool = new VeilPool(2);
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
        VeilPool pool = new VeilPool(2);
        bytes32 l0 = keccak256("note-0");
        bytes32 l1 = keccak256("note-1");
        pool.deposit(l0, "");
        pool.deposit(l1, "");

        bytes32 expected = _hash(_hash(l0, l1), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 two-leaf root");
    }

    function test_TreeFullReverts() public {
        // depth-2 tree has capacity 2^2 = 4 leaves.
        VeilPool pool = new VeilPool(2);
        pool.deposit(keccak256("0"), "");
        pool.deposit(keccak256("1"), "");
        pool.deposit(keccak256("2"), "");
        pool.deposit(keccak256("3"), "");
        vm.expectRevert(MerkleTreeWithHistory.TreeFull.selector);
        pool.deposit(keccak256("4"), "");
    }

    function test_MarkNullifierThenSpent() public {
        VeilPoolHarness pool = new VeilPoolHarness(16);
        bytes32 nf = keccak256("nullifier-1");
        assertTrue(!pool.isSpent(nf), "unspent before");
        pool.exposed_markNullifier(nf);
        assertTrue(pool.isSpent(nf), "spent after");
    }

    function test_MarkNullifierTwiceReverts() public {
        VeilPoolHarness pool = new VeilPoolHarness(16);
        bytes32 nf = keccak256("nullifier-1");
        pool.exposed_markNullifier(nf);
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.exposed_markNullifier(nf);
    }

    function test_HashLeftRightIsSha256() public {
        VeilPool pool = new VeilPool(4);
        bytes32 l = keccak256("L");
        bytes32 r = keccak256("R");
        assertEq(pool.hashLeftRight(l, r), sha256(abi.encodePacked(l, r)), "hash == sha256(l||r)");
    }
}
