// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilEscrow} from "../src/VeilEscrow.sol";

contract VeilEscrowTest is Test {
    VeilEscrow escrow;
    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");

    bytes32 constant S = bytes32(uint256(0xC0FFEE));
    bytes32 H; // keccak256(abi.encodePacked(S))

    function setUp() public {
        escrow = new VeilEscrow(lender);
        H = keccak256(abi.encodePacked(S));
        vm.deal(borrower, 10 ether);
    }

    function _lock(uint256 amt, uint64 deadline) internal {
        vm.prank(borrower);
        escrow.lock{value: amt}(H, deadline);
    }

    // ---- lock ----
    function test_Lock_StoresCollateral() public {
        _lock(3 ether, uint64(block.timestamp + 1 days));
        (address dep, uint256 amt, bytes32 h, uint64 dl, bool closed) = escrow.locks(H);
        assertEq(dep, borrower);
        assertEq(amt, 3 ether);
        assertEq(h, H);
        assertEq(dl, uint64(block.timestamp + 1 days));
        assertFalse(closed);
        assertEq(address(escrow).balance, 3 ether);
    }

    function test_Lock_RevertsZeroValue() public {
        vm.prank(borrower);
        vm.expectRevert(VeilEscrow.ZeroAmount.selector);
        escrow.lock{value: 0}(H, uint64(block.timestamp + 1 days));
    }

    function test_Lock_RevertsPastDeadline() public {
        vm.prank(borrower);
        vm.expectRevert(VeilEscrow.BadDeadline.selector);
        escrow.lock{value: 1 ether}(H, uint64(block.timestamp));
    }

    function test_Lock_RevertsReuseH() public {
        _lock(1 ether, uint64(block.timestamp + 1 days));
        vm.prank(borrower);
        vm.expectRevert(VeilEscrow.AlreadyUsed.selector);
        escrow.lock{value: 1 ether}(H, uint64(block.timestamp + 2 days));
    }

    // ---- repay-reveal ----
    function test_ClaimRepaid_ReturnsToDepositor() public {
        _lock(2 ether, uint64(block.timestamp + 1 days));
        uint256 before = borrower.balance;
        escrow.claimRepaid(S); // anyone can relay S
        assertEq(borrower.balance, before + 2 ether);
        (, , , , bool closed) = escrow.locks(H);
        assertTrue(closed);
        assertEq(address(escrow).balance, 0);
    }

    function test_ClaimRepaid_WrongSecretNotFound() public {
        _lock(2 ether, uint64(block.timestamp + 1 days));
        vm.expectRevert(VeilEscrow.NotFound.selector);
        escrow.claimRepaid(bytes32(uint256(0xDEAD))); // hashes to an empty slot
    }

    function test_ClaimRepaid_DoubleSpendReverts() public {
        _lock(2 ether, uint64(block.timestamp + 1 days));
        escrow.claimRepaid(S);
        vm.expectRevert(VeilEscrow.AlreadyClosed.selector);
        escrow.claimRepaid(S);
    }

    // ---- timeout liquidation (favors lender) ----
    function test_LiquidateTimeout_PaysLender() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        _lock(5 ether, dl);
        vm.warp(dl + 1);
        uint256 before = lender.balance;
        escrow.liquidateTimeout(H); // permissionless
        assertEq(lender.balance, before + 5 ether);
        (, , , , bool closed) = escrow.locks(H);
        assertTrue(closed);
    }

    function test_LiquidateTimeout_RevertsBeforeDeadline() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        _lock(5 ether, dl);
        vm.expectRevert(VeilEscrow.NotYetDue.selector);
        escrow.liquidateTimeout(H);
    }

    function test_RepaidBeatsTimeout_NoDoubleClaim() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        _lock(4 ether, dl);
        escrow.claimRepaid(S); // borrower repaid in time
        vm.warp(dl + 1);
        vm.expectRevert(VeilEscrow.AlreadyClosed.selector);
        escrow.liquidateTimeout(H); // lender can't also grab it
    }

    function test_LiquidatePrice_StretchReverts() public {
        _lock(1 ether, uint64(block.timestamp + 1 days));
        vm.expectRevert(bytes("price-default: stretch, not wired"));
        escrow.liquidatePrice(H);
    }

    // ---- storage layout (the guest depends on this) ----
    /// @dev `locks` is slot 0; base = keccak256(abi.encode(H, uint256(0)));
    ///      amount is at base+1, H at base+2. The guest's eth_getProof targets base+1.
    function test_StorageLayout_AmountAtBasePlusOne() public {
        _lock(7 ether, uint64(block.timestamp + 1 days));
        bytes32 base = keccak256(abi.encode(H, uint256(0)));
        bytes32 amountSlot = bytes32(uint256(base) + 1);
        bytes32 hSlot = bytes32(uint256(base) + 2);
        assertEq(uint256(vm.load(address(escrow), amountSlot)), 7 ether, "amount@base+1");
        assertEq(vm.load(address(escrow), hSlot), H, "H@base+2");
    }
}
