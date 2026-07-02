// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilEthLock} from "../src/VeilEthLock.sol";
import {DepositFromEthVerifier} from "../src/DepositFromEthVerifier.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

/// Exercises VeilEthLock against the REAL snarkjs-exported deposit_from_eth verifier, using a REAL
/// Groth16 proof fixture (from `snarkjs zkey export soliditycalldata` over the ceremony zkey). The
/// canonical opening: amount = 2e18, C = the AVAILABLE note commitment 0x01c209ef… (circom/README.md).
contract VeilEthLockTest is Test {
    VeilEthLock internal lockContract;
    MockWstETH internal weth;
    DepositFromEthVerifier internal verifier;
    address internal user = address(0xA11CE);

    // --- REAL proof fixture (deposit_from_eth, ceremony zkey) ---
    uint256 internal constant AMOUNT = 2_000_000_000_000_000_000; // 2e18 = 0x1bc16d674ec80000
    uint256 internal constant C =
        0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10d;

    function pA() internal pure returns (uint[2] memory) {
        return [
            uint(0x2b2278fa0260b1bcb913fb50afb95e4ba816a0f6053c8ae16e49a6e7491921b8),
            uint(0x13afbc6ef4d83e13fd4cbedcc68f3ea6e05075387c0bc7edd420fd5e1aca0b8c)
        ];
    }

    function pB() internal pure returns (uint[2][2] memory) {
        return [
            [
                uint(0x113c59046154f8fa6286574d5d503ee8f24c24439aa97248ddc3da36d1c53c56),
                uint(0x16e9c9a0fadd3653e5f1c8aa33214cd98abe26d976a998abc8bd82fd8b5ff38c)
            ],
            [
                uint(0x0d76aa59711e716cfbb980c67914e3f60673bc38bb12697daf82e3d5dd33606a),
                uint(0x2ffb643e7db6825cb8bb79b7d0060b1984e3d15abdc468718fcf98a3230eb441)
            ]
        ];
    }

    function pC() internal pure returns (uint[2] memory) {
        return [
            uint(0x1d06e2c8a7540b2d40b0667cbff241256440f632a4b33d643ed1f4c56cf4b68e),
            uint(0x1ce0ea4923507d02502214d17ba3d0939e2ca2b2170172edb9fcc9909dbdeb1d)
        ];
    }

    function setUp() public {
        verifier = new DepositFromEthVerifier();
        weth = new MockWstETH();
        lockContract = new VeilEthLock(address(weth), address(verifier));
        weth.mint(user, 10 ether);
        vm.prank(user);
        weth.approve(address(lockContract), type(uint256).max);
    }

    function test_realProof_locksAndEscrows() public {
        vm.expectEmit(true, true, false, true);
        emit VeilEthLock.Locked(C, AMOUNT, user);
        vm.prank(user);
        lockContract.lock(AMOUNT, C, pA(), pB(), pC());

        assertEq(weth.balanceOf(address(lockContract)), AMOUNT, "WETH escrowed");
        assertEq(weth.balanceOf(user), 10 ether - AMOUNT, "WETH left the user");
        assertEq(lockContract.totalLocked(), AMOUNT, "solvency floor");
        (uint256 amt, address owner, uint64 bn) = lockContract.locks(C);
        assertEq(amt, AMOUNT, "lock amount");
        assertEq(owner, user, "lock owner");
        assertGt(bn, 0, "block recorded");
        assertTrue(lockContract.isLocked(C), "isLocked");
    }

    function test_rejectsTamperedProof() public {
        uint[2] memory badA = pA();
        badA[0] = badA[0] ^ 1; // flip a bit → off the pairing
        vm.prank(user);
        vm.expectRevert(); // verifier rejects (revert or false) → lock reverts
        lockContract.lock(AMOUNT, C, badA, pB(), pC());
        assertEq(weth.balanceOf(address(lockContract)), 0, "no WETH moved");
    }

    function test_rejectsWrongAmount_lockLessThanCommitted() public {
        // The proof binds C to 2e18; claiming a different amount changes the public input → invalid.
        vm.prank(user);
        vm.expectRevert(VeilEthLock.InvalidOpeningProof.selector);
        lockContract.lock(AMOUNT - 1, C, pA(), pB(), pC());
        assertEq(weth.balanceOf(address(lockContract)), 0, "no WETH moved");
    }

    function test_rejectsDuplicateCommitment() public {
        vm.prank(user);
        lockContract.lock(AMOUNT, C, pA(), pB(), pC());
        vm.prank(user);
        vm.expectRevert(VeilEthLock.CommitmentAlreadyLocked.selector);
        lockContract.lock(AMOUNT, C, pA(), pB(), pC());
    }

    function test_rejectsZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(VeilEthLock.ZeroAmount.selector);
        lockContract.lock(0, C, pA(), pB(), pC());
    }
}
