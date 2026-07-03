// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VeilEthLockV2} from "../src/VeilEthLockV2.sol";
import {DepositFromEthVerifier} from "../src/DepositFromEthVerifier.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

/// @dev Mock Axelar gateway with a settable validateContractCall return value.
///      Marked view on validateContractCall — ABI-compatible; production gateway is non-view
///      (it mutates to mark commandId executed), but for unit tests a pure boolean flag suffices.
contract MockGatewayV2 {
    bool public shouldApprove = true;

    function setApprove(bool a) external { shouldApprove = a; }

    function callContract(string calldata, string calldata, bytes calldata) external {}

    function validateContractCall(
        bytes32,
        string calldata,
        string calldata,
        bytes32
    ) external view returns (bool) {
        return shouldApprove;
    }
}

/// @dev Minimal gas service stub — accepts native ETH, does nothing else.
contract MockGasV2 {
    function payNativeGasForContractCall(
        address,
        string calldata,
        string calldata,
        bytes calldata,
        address
    ) external payable {}
}

/// @notice Tests for VeilEthLockV2 execute (release) logic.
///         Uses the REAL DepositFromEthVerifier + the hardcoded proof fixture from VeilEthLock.t.sol
///         to genuinely populate locks[C] via lock(), then exercises all five execute scenarios.
///         This covers the full lock → release round trip.
contract VeilEthLockV2Test is Test {
    VeilEthLockV2 internal lockc;
    MockWstETH internal weth;
    MockGatewayV2 internal gw;
    MockGasV2 internal gas;

    address internal user      = address(0xA11CE);
    address internal recipient = address(0xD00D);

    // Trusted Stellar source pins (must match what setTrustedSource receives).
    string internal constant SRC_CHAIN = "stellar-2026-q1-2";
    string internal constant SRC_ADDR  = "CVEILPOOLSTELLARADDRESSSTRKEYPLACEHOLDER00000000000000000";

    // Outbound destination (required by lock — checked for non-empty before locking).
    string internal constant DEST_CHAIN    = "stellar-2026-q1-2";
    string internal constant DEST_CONTRACT = "CVEILPOOLSTELLARADDRESSSTRKEYPLACEHOLDER00000000000000000";

    // --- Real proof fixture (deposit_from_eth ceremony zkey, same as VeilEthLock.t.sol) ---
    uint256 internal constant AMOUNT = 2_000_000_000_000_000_000; // 2e18
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
        // Deploy with real verifier so lock()'s proof gate is genuine.
        DepositFromEthVerifier verifier = new DepositFromEthVerifier();
        weth = new MockWstETH();
        gw   = new MockGatewayV2();
        gas  = new MockGasV2();

        lockc = new VeilEthLockV2(address(weth), address(verifier), address(gw), address(gas));

        // Outbound destination — required by lock() (reverts on DestinationUnset otherwise).
        lockc.setDestination(DEST_CHAIN, DEST_CONTRACT);

        // Inbound trusted source — required by execute().
        lockc.setTrustedSource(SRC_CHAIN, SRC_ADDR);

        // Seed user with WETH and allowance.
        weth.mint(user, AMOUNT);
        vm.prank(user);
        weth.approve(address(lockc), type(uint256).max);

        // Genuinely populate locks[C] via the real lock() + real proof.
        // This covers the full lock→release round trip rather than a test hook.
        vm.prank(user);
        lockc.lock(AMOUNT, C, pA(), pB(), pC());
    }

    // -------------------------------------------------------------------------
    // execute tests
    // -------------------------------------------------------------------------

    /// @notice Happy path: recipient receives WETH, isReleased flips to true.
    function test_execute_releasesToRecipient() public {
        bytes memory payload = abi.encode(C, recipient);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);

        assertEq(weth.balanceOf(recipient), AMOUNT, "recipient should receive AMOUNT");
        assertTrue(lockc.isReleased(C), "isReleased should be true after release");
        assertEq(lockc.totalLocked(), 0, "totalLocked should decrease by AMOUNT");
    }

    /// @notice Second execute with the same C must revert AlreadyReleased (contract-level guard).
    function test_execute_rejectsDoubleRelease() public {
        bytes memory payload = abi.encode(C, recipient);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);

        vm.expectRevert(VeilEthLockV2.AlreadyReleased.selector);
        lockc.execute(bytes32(uint256(2)), SRC_CHAIN, SRC_ADDR, payload);
    }

    /// @notice Wrong sourceChain must revert UntrustedSource (tests the other branch of the || guard).
    function test_execute_rejectsUntrustedSourceChain() public {
        bytes memory payload = abi.encode(C, recipient);

        vm.expectRevert(VeilEthLockV2.UntrustedSource.selector);
        lockc.execute(bytes32(uint256(1)), "evil-chain", SRC_ADDR, payload);
    }

    /// @notice Wrong sourceAddress must revert UntrustedSource regardless of gateway approval.
    function test_execute_rejectsUntrustedSourceAddress() public {
        bytes memory payload = abi.encode(C, recipient);

        vm.expectRevert(VeilEthLockV2.UntrustedSource.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, "CBADSOURCE0000000000000000000000000000000000000000000000", payload);
    }

    /// @notice When the gateway returns false (message not approved), must revert NotApprovedByGateway.
    function test_execute_rejectsWhenGatewayNotApproved() public {
        gw.setApprove(false);
        bytes memory payload = abi.encode(C, recipient);

        vm.expectRevert(VeilEthLockV2.NotApprovedByGateway.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
    }

    /// @notice Payload referencing a C that was never locked must revert NothingLocked.
    function test_execute_rejectsUnknownCommitment() public {
        uint256 unknownC = uint256(0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF);
        bytes memory payload = abi.encode(unknownC, recipient);

        vm.expectRevert(VeilEthLockV2.NothingLocked.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
    }
}
