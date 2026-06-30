// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilPool, IRiscZeroVerifier, IERC20} from "../src/VeilPool.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

bytes32 constant LOCK_IMG = bytes32(uint256(0xABCD));
bytes32 constant UNLOCK_IMG = bytes32(uint256(0xBEEF));
bytes32 constant SEIZE_IMG = bytes32(uint256(0xCAFE));

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

/// @dev Exposes internal helpers so the tree + nullifier set can be exercised directly with
///      arbitrary leaves (the real `deposit` derives the commitment on-chain). Test infra only.
contract VeilPoolHarness is VeilPool {
    constructor(uint32 levels_, IRiscZeroVerifier v_, IERC20 w_)
        VeilPool(levels_, v_, LOCK_IMG, UNLOCK_IMG, SEIZE_IMG, msg.sender, w_)
    {}

    function exposed_markNullifier(bytes32 nf) external {
        _markNullifier(nf);
    }

    /// Insert an arbitrary leaf, bypassing wstETH custody (for tree-primitive + joinsplit tests
    /// that only need a known root, not real collateral backing).
    function exposed_insert(bytes32 commitment) external returns (uint32) {
        return _insert(commitment);
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
    event Unlocked(bytes32 indexed nullifierIn, bytes32 indexed commitmentOut, uint32 leafIndex);
    event Seized(
        bytes32 indexed nullifierIn,
        bytes32 commitmentLiquidator,
        bytes32 commitmentChange,
        uint32 leafLiquidator,
        uint32 leafChange
    );

    MockRiscZeroVerifier internal verifier = new MockRiscZeroVerifier();
    MockWstETH internal wst = new MockWstETH();

    function _deploy(uint32 levels) internal returns (VeilPoolHarness) {
        // The test contract is the disclosed-trust relayer (can post Soroban roots).
        return new VeilPoolHarness(levels, verifier, IERC20(address(wst)));
    }

    /// Build a 128-byte unlock journal and the matching mock seal (= its sha256 digest).
    function _unlockJournal(bytes32 rEth, bytes32 rSor, bytes32 nfIn, bytes32 cOut)
        internal
        pure
        returns (bytes memory journal, bytes memory seal)
    {
        journal = abi.encodePacked(rEth, rSor, nfIn, cOut);
        seal = abi.encodePacked(sha256(journal));
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
        VeilPoolHarness pool = _deploy(4);
        assertEq(pool.zeros(0), Z0, "z0");
        assertEq(pool.zeros(1), Z1, "z1");
        assertEq(pool.zeros(2), Z2, "z2");
        assertEq(pool.zeros(3), Z3, "z3");
    }

    function test_EmptyRootIsZerosAtLevels() public {
        VeilPoolHarness pool = _deploy(4);
        // Root of an empty depth-4 tree is the all-zero subtree root of height 4.
        bytes32 z4 = _hash(Z3, Z3);
        assertEq(pool.getLastRoot(), z4, "empty root");
        assertTrue(pool.isKnownRoot(z4), "empty root known");
    }

    /// Recompute the AVAILABLE note commitment exactly as VeilPool.deposit / veil-core do.
    function _noteCommitment(uint128 amount, bytes32 blinding, bytes32 spendPk)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked("VEIL_NOTE", uint8(0x00), amount, blinding, spendPk, bytes32(0)));
    }

    /// Fund the test contract with wstETH and approve the pool, so deposit's transferFrom succeeds.
    function _fundAndApprove(VeilPool pool, uint128 amount) internal {
        wst.mint(address(this), amount);
        wst.approve(address(pool), amount);
    }

    function test_DepositEscrowsAndInsertsBackedNote() public {
        VeilPoolHarness pool = _deploy(16);
        uint128 amount = 2e18;
        bytes32 blinding = keccak256("blinding");
        bytes32 spendPk = keccak256("spendPk");
        bytes memory enc = hex"deadbeef";
        _fundAndApprove(pool, amount);

        bytes32 expectedC = _noteCommitment(amount, blinding, spendPk);
        vm.expectEmit(true, false, false, true);
        emit Commitment(expectedC, 0, enc);
        uint32 idx = pool.deposit(amount, blinding, spendPk, enc);

        assertEq(idx, 0, "first leaf index");
        assertEq(pool.nextIndex(), 1, "nextIndex advanced");
        // the collateral was actually escrowed and the public aggregate tracks it.
        assertEq(wst.balanceOf(address(pool)), amount, "wstETH escrowed");
        assertEq(pool.totalDeposited(), amount, "totalDeposited tracks");
    }

    function test_DepositCommitmentMatchesCrossImplVector() public {
        // CROSS-IMPL VECTOR (note commitment): amount=2e18, blinding=0x01..01, spendPk=0x02..02,
        // domain AVAILABLE, aux=0. Identical to veil_core::notes::note_commitment. If the byte
        // layout drifts between deposit and the borrow guest, deposited notes won't be provable.
        VeilPoolHarness pool = _deploy(16);
        uint128 amount = 2e18;
        bytes32 blinding = bytes32(uint256(0x01) * (type(uint256).max / 0xFF));
        bytes32 spendPk = bytes32(uint256(0x02) * (type(uint256).max / 0xFF));
        _fundAndApprove(pool, amount);

        bytes32 c = _noteCommitment(amount, blinding, spendPk);
        assertEq(c, 0xb4390cd51e4910e5568adda7fccd7deae6af715819a96f525ed1a084a65efcee, "note C drifted");
    }

    function test_DepositIncrementsLeafIndexAndTotal() public {
        VeilPoolHarness pool = _deploy(16);
        _fundAndApprove(pool, 3e18);
        uint32 i0 = pool.deposit(1e18, keccak256("a"), keccak256("pk"), "");
        uint32 i1 = pool.deposit(2e18, keccak256("b"), keccak256("pk"), "");
        assertEq(i0, 0, "leaf 0");
        assertEq(i1, 1, "leaf 1");
        assertEq(pool.nextIndex(), 2, "nextIndex");
        assertEq(pool.totalDeposited(), 3e18, "totalDeposited sums both");
    }

    function test_DepositUpdatesRootAndKeepsHistory() public {
        VeilPoolHarness pool = _deploy(16);
        bytes32 emptyRoot = pool.getLastRoot();

        _fundAndApprove(pool, 1e18);
        pool.deposit(1e18, keccak256("a"), keccak256("pk"), "");
        bytes32 newRoot = pool.getLastRoot();

        assertTrue(newRoot != emptyRoot, "root changed");
        assertTrue(pool.isKnownRoot(newRoot), "new root known");
        assertTrue(pool.isKnownRoot(emptyRoot), "old root still in history");
    }

    function test_DepositWithoutApprovalReverts() public {
        VeilPoolHarness pool = _deploy(16);
        wst.mint(address(this), 1e18); // funded but NOT approved
        vm.expectRevert(MockWstETH.InsufficientAllowance.selector);
        pool.deposit(1e18, keccak256("b"), keccak256("pk"), "");
        assertEq(pool.nextIndex(), 0, "no note inserted when escrow fails");
    }

    function test_UnknownRootRejected() public {
        VeilPoolHarness pool = _deploy(16);
        assertTrue(!pool.isKnownRoot(keccak256("never inserted")), "random root unknown");
        assertTrue(!pool.isKnownRoot(bytes32(0)), "zero never known");
    }

    function test_RootMatchesIndependentComputation() public {
        // depth-2 tree, single leaf at index 0:
        // level0: [L, z0, z0, z0] -> node = hash(L, z0)
        // level1: hash(node, z1)
        VeilPoolHarness pool = _deploy(2);
        bytes32 leaf = keccak256("the-only-note");
        pool.exposed_insert(leaf);

        bytes32 expected = _hash(_hash(leaf, Z0), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 single-leaf root");
    }

    function test_CrossImplRootVector() public {
        // SHARED CROSS-IMPL VECTOR: leaf = 0xCD..CD, depth-2, index 0, empty siblings.
        // The RISC Zero borrow guest (veil-core notes::merkle_root_matches_canonical_empty_siblings)
        // asserts this identical literal. Any drift between contract and guest breaks one side.
        VeilPoolHarness pool = _deploy(2);
        // leaf = 0xCDCD..CD (byte 0xCD repeated 32x) == 0xCD * 0x0101..01
        bytes32 leaf = bytes32(uint256(0xCD) * (type(uint256).max / 0xFF));
        pool.exposed_insert(leaf);
        assertEq(
            pool.getLastRoot(),
            0xe7a935fd4370e33243b4b66fe104dbee170db86603e4a0845d6bb491d0187a44,
            "Solidity root drifted from the shared cross-impl vector"
        );
    }

    function test_TwoLeavesRootMatchesIndependentComputation() public {
        // depth-2 tree, leaves L0,L1 share the same level-0 parent:
        // node01 = hash(L0, L1); root = hash(node01, z1)
        VeilPoolHarness pool = _deploy(2);
        bytes32 l0 = keccak256("note-0");
        bytes32 l1 = keccak256("note-1");
        pool.exposed_insert(l0);
        pool.exposed_insert(l1);

        bytes32 expected = _hash(_hash(l0, l1), Z1);
        assertEq(pool.getLastRoot(), expected, "depth-2 two-leaf root");
    }

    function test_TreeFullReverts() public {
        // depth-2 tree has capacity 2^2 = 4 leaves.
        VeilPoolHarness pool = _deploy(2);
        pool.exposed_insert(keccak256("0"));
        pool.exposed_insert(keccak256("1"));
        pool.exposed_insert(keccak256("2"));
        pool.exposed_insert(keccak256("3"));
        vm.expectRevert(MerkleTreeWithHistory.TreeFull.selector);
        pool.exposed_insert(keccak256("4"));
    }

    function test_MarkNullifierThenSpent() public {
        VeilPoolHarness pool = new VeilPoolHarness(16, verifier, IERC20(address(wst)));
        bytes32 nf = keccak256("nullifier-1");
        assertTrue(!pool.isSpent(nf), "unspent before");
        pool.exposed_markNullifier(nf);
        assertTrue(pool.isSpent(nf), "spent after");
    }

    function test_MarkNullifierTwiceReverts() public {
        VeilPoolHarness pool = new VeilPoolHarness(16, verifier, IERC20(address(wst)));
        bytes32 nf = keccak256("nullifier-1");
        pool.exposed_markNullifier(nf);
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.exposed_markNullifier(nf);
    }

    function test_HashLeftRightIsSha256() public {
        VeilPoolHarness pool = _deploy(4);
        bytes32 l = keccak256("L");
        bytes32 r = keccak256("R");
        assertEq(pool.hashLeftRight(l, r), sha256(abi.encodePacked(l, r)), "hash == sha256(l||r)");
    }

    // ---- lock joinsplit (item 4) ----

    function test_LockSpendsInputAndInsertsLockedNote() public {
        VeilPoolHarness pool = _deploy(16);
        // An AVAILABLE note exists, producing a known root to prove against.
        pool.exposed_insert(keccak256("available-note"));
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
        VeilPoolHarness pool = _deploy(16);
        bytes32 badRoot = keccak256("not a real root");
        (bytes memory journal, bytes memory seal) =
            _lockJournal(badRoot, keccak256("n"), keccak256("c"), keccak256("l"));
        vm.expectRevert(VeilPool.UnknownRoot.selector);
        pool.lock(seal, journal, "");
    }

    function test_LockBadProofReverts() public {
        VeilPoolHarness pool = _deploy(16);
        pool.exposed_insert(keccak256("available-note"));
        bytes32 root = pool.getLastRoot();
        (bytes memory journal,) = _lockJournal(root, keccak256("n"), keccak256("c"), keccak256("l"));
        bytes memory badSeal = abi.encodePacked(keccak256("wrong")); // != sha256(journal)
        vm.expectRevert(bytes("bad proof"));
        pool.lock(badSeal, journal, "");
    }

    function test_LockDoubleSpendReverts() public {
        VeilPoolHarness pool = _deploy(16);
        pool.exposed_insert(keccak256("available-note"));
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
        VeilPoolHarness pool = _deploy(16);
        bytes memory shortJournal = hex"deadbeef";
        vm.expectRevert(VeilPool.BadLockJournalLength.selector);
        pool.lock(hex"00", shortJournal, "");
    }

    // ---- unlock (item 7): spend a LOCKED note -> mint an AVAILABLE note, gated on a repay-proof ----

    /// Deposit (giving a known pool root R_eth) and post a Soroban root R_sor. Returns both.
    function _primeUnlock(VeilPoolHarness pool) internal returns (bytes32 rEth, bytes32 rSor) {
        pool.exposed_insert(keccak256("locked-collateral-note"));
        rEth = pool.getLastRoot();
        rSor = keccak256("R_sor-after-repay");
        pool.addSorobanRoot(rSor);
    }

    function test_UnlockSpendsLockedAndMintsAvailable() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rSor) = _primeUnlock(pool);
        bytes32 nfIn = keccak256("locked-note-nullifier");
        bytes32 cOut = keccak256("available-note-out");
        (bytes memory journal, bytes memory seal) = _unlockJournal(rEth, rSor, nfIn, cOut);

        vm.expectEmit(true, true, false, true);
        emit Unlocked(nfIn, cOut, 1);
        uint32 idx = pool.unlock(seal, journal, "");

        assertEq(idx, 1, "recovered AVAILABLE note is the second leaf");
        assertTrue(pool.isSpent(nfIn), "locked note nullifier spent");
        assertEq(pool.nextIndex(), 2, "tree advanced");
    }

    function test_UnlockUnknownEthRootReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (, bytes32 rSor) = _primeUnlock(pool);
        bytes32 badEth = keccak256("not a pool root");
        (bytes memory journal, bytes memory seal) =
            _unlockJournal(badEth, rSor, keccak256("n"), keccak256("c"));
        vm.expectRevert(VeilPool.UnknownRoot.selector);
        pool.unlock(seal, journal, "");
    }

    function test_UnlockUnknownSorobanRootReverts() public {
        // R_eth is known but the Soroban repaid-root was never relayed -> no repay-proof anchor.
        VeilPoolHarness pool = _deploy(16);
        pool.exposed_insert(keccak256("locked-collateral-note"));
        bytes32 rEth = pool.getLastRoot();
        bytes32 rSor = keccak256("never-relayed");
        (bytes memory journal, bytes memory seal) =
            _unlockJournal(rEth, rSor, keccak256("n"), keccak256("c"));
        vm.expectRevert(VeilPool.UnknownSorobanRoot.selector);
        pool.unlock(seal, journal, "");
    }

    function test_UnlockBadProofReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rSor) = _primeUnlock(pool);
        (bytes memory journal,) = _unlockJournal(rEth, rSor, keccak256("n"), keccak256("c"));
        bytes memory badSeal = abi.encodePacked(keccak256("wrong"));
        vm.expectRevert(bytes("bad proof"));
        pool.unlock(badSeal, journal, "");
    }

    function test_UnlockDoubleSpendReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rSor) = _primeUnlock(pool);
        bytes32 nfIn = keccak256("locked-note-nullifier");
        (bytes memory j1, bytes memory s1) = _unlockJournal(rEth, rSor, nfIn, keccak256("c1"));
        pool.unlock(s1, j1, "");

        // reuse the same nullifier against a still-known root pair
        bytes32 rEth2 = pool.getLastRoot();
        (bytes memory j2, bytes memory s2) = _unlockJournal(rEth2, rSor, nfIn, keccak256("c2"));
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.unlock(s2, j2, "");
    }

    function test_UnlockBadJournalLengthReverts() public {
        VeilPoolHarness pool = _deploy(16);
        vm.expectRevert(VeilPool.BadUnlockJournalLength.selector);
        pool.unlock(hex"00", hex"deadbeef", "");
    }

    function test_AddSorobanRootOnlyRelayer() public {
        // Deploy with a DIFFERENT relayer so this test contract is not authorized.
        address otherRelayer = address(0xBEEF);
        VeilPool pool = new VeilPool(16, verifier, LOCK_IMG, UNLOCK_IMG, SEIZE_IMG, otherRelayer, IERC20(address(wst)));
        vm.expectRevert(VeilPool.NotRelayer.selector);
        pool.addSorobanRoot(keccak256("r"));
    }

    function test_KnownSorobanRootTracked() public {
        VeilPoolHarness pool = _deploy(16);
        bytes32 rSor = keccak256("R_sor");
        assertTrue(!pool.knownSorobanRoots(rSor), "unknown before");
        pool.addSorobanRoot(rSor);
        assertTrue(pool.knownSorobanRoots(rSor), "known after");
    }

    // ---- seize (item 8): spend a LIQUIDATED LOCKED note -> T to liquidator, change to borrower ----

    /// 176-byte seize journal: R_eth ‖ R_liq ‖ seized(16 BE, zero-padded to 32) ‖ nfIn ‖ cLiq ‖ cChange.
    function _seizeJournal(bytes32 rEth, bytes32 rLiq, uint128 seized, bytes32 nfIn, bytes32 cLiq, bytes32 cChange)
        internal
        pure
        returns (bytes memory journal, bytes memory seal)
    {
        journal = abi.encodePacked(rEth, rLiq, bytes16(seized), nfIn, cLiq, cChange);
        seal = abi.encodePacked(sha256(journal));
    }

    /// Deposit (known pool root R_eth) and post a Soroban liquidated-root R_liq. Returns both.
    function _primeSeize(VeilPoolHarness pool) internal returns (bytes32 rEth, bytes32 rLiq) {
        pool.exposed_insert(keccak256("locked-collateral-note"));
        rEth = pool.getLastRoot();
        rLiq = keccak256("R_liq-after-liquidation");
        pool.addLiquidatedRoot(rLiq);
    }

    function test_SeizeSpendsLockedAndMintsTwoNotes() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rLiq) = _primeSeize(pool);
        bytes32 nfIn = keccak256("locked-note-nullifier");
        bytes32 cLiq = keccak256("liquidator-note");
        bytes32 cChange = keccak256("borrower-change-note");
        (bytes memory journal, bytes memory seal) = _seizeJournal(rEth, rLiq, 4e18, nfIn, cLiq, cChange);

        vm.expectEmit(true, false, false, true);
        emit Seized(nfIn, cLiq, cChange, 1, 2);
        pool.seize(seal, journal, "", "");

        assertTrue(pool.isSpent(nfIn), "locked note nullifier spent");
        assertEq(pool.nextIndex(), 3, "two notes inserted after the collateral leaf");
    }

    function test_SeizeUnknownEthRootReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (, bytes32 rLiq) = _primeSeize(pool);
        bytes32 badEth = keccak256("not a pool root");
        (bytes memory journal, bytes memory seal) =
            _seizeJournal(badEth, rLiq, 4e18, keccak256("n"), keccak256("cl"), keccak256("cc"));
        vm.expectRevert(VeilPool.UnknownRoot.selector);
        pool.seize(seal, journal, "", "");
    }

    function test_SeizeUnknownLiquidatedRootReverts() public {
        VeilPoolHarness pool = _deploy(16);
        pool.exposed_insert(keccak256("locked-collateral-note"));
        bytes32 rEth = pool.getLastRoot();
        bytes32 rLiq = keccak256("never-relayed"); // no default-proof anchor
        (bytes memory journal, bytes memory seal) =
            _seizeJournal(rEth, rLiq, 4e18, keccak256("n"), keccak256("cl"), keccak256("cc"));
        vm.expectRevert(VeilPool.UnknownLiquidatedRoot.selector);
        pool.seize(seal, journal, "", "");
    }

    function test_SeizeBadProofReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rLiq) = _primeSeize(pool);
        (bytes memory journal,) = _seizeJournal(rEth, rLiq, 4e18, keccak256("n"), keccak256("cl"), keccak256("cc"));
        bytes memory badSeal = abi.encodePacked(keccak256("wrong"));
        vm.expectRevert(bytes("bad proof"));
        pool.seize(badSeal, journal, "", "");
    }

    function test_SeizeDoubleSpendReverts() public {
        VeilPoolHarness pool = _deploy(16);
        (bytes32 rEth, bytes32 rLiq) = _primeSeize(pool);
        bytes32 nfIn = keccak256("locked-note-nullifier");
        (bytes memory j1, bytes memory s1) = _seizeJournal(rEth, rLiq, 4e18, nfIn, keccak256("cl1"), keccak256("cc1"));
        pool.seize(s1, j1, "", "");

        bytes32 rEth2 = pool.getLastRoot();
        (bytes memory j2, bytes memory s2) = _seizeJournal(rEth2, rLiq, 4e18, nfIn, keccak256("cl2"), keccak256("cc2"));
        vm.expectRevert(VeilPool.NullifierAlreadySpent.selector);
        pool.seize(s2, j2, "", "");
    }

    function test_SeizeBadJournalLengthReverts() public {
        VeilPoolHarness pool = _deploy(16);
        vm.expectRevert(VeilPool.BadSeizeJournalLength.selector);
        pool.seize(hex"00", hex"deadbeef", "", "");
    }

    function test_AddLiquidatedRootOnlyRelayer() public {
        address otherRelayer = address(0xBEEF);
        VeilPool pool = new VeilPool(16, verifier, LOCK_IMG, UNLOCK_IMG, SEIZE_IMG, otherRelayer, IERC20(address(wst)));
        vm.expectRevert(VeilPool.NotRelayer.selector);
        pool.addLiquidatedRoot(keccak256("r"));
    }

    function test_KnownLiquidatedRootTracked() public {
        VeilPoolHarness pool = _deploy(16);
        bytes32 rLiq = keccak256("R_liq");
        assertTrue(!pool.knownLiquidatedRoots(rLiq), "unknown before");
        pool.addLiquidatedRoot(rLiq);
        assertTrue(pool.knownLiquidatedRoots(rLiq), "known after");
    }
}
