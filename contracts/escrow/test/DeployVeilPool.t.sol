// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployVeilPool} from "../script/DeployVeilPool.s.sol";
import {VeilPool} from "../src/VeilPool.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

/// Offline verification of the Sepolia deploy script's logic (network forking is unavailable in this
/// environment). Etches code at the router address so the `verifier.code.length` guard passes, then
/// exercises the happy path (wiring) and every guard revert.
contract DeployVeilPoolTest is Test {
    DeployVeilPool internal script;
    address internal constant ROUTER = 0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187;
    address internal constant RELAYER = address(0xBEEF);

    bytes32 internal constant LOCK_ID = bytes32(uint256(0xa11));
    bytes32 internal constant UNLOCK_ID = bytes32(uint256(0xb22));
    bytes32 internal constant SEIZE_ID = bytes32(uint256(0xc33));

    function setUp() public {
        script = new DeployVeilPool();
        // Minimal runtime bytecode so ROUTER has non-empty code (returns 32 bytes).
        vm.etch(ROUTER, hex"600160005260206000f3");
    }

    function test_deploysAndWiresEverything() public {
        (MockWstETH wsteth, VeilPool pool) = script.deploy(ROUTER, LOCK_ID, UNLOCK_ID, SEIZE_ID, RELAYER);

        assertTrue(address(wsteth) != address(0), "wstETH deployed");
        assertTrue(address(pool) != address(0), "pool deployed");
        assertEq(address(pool.verifier()), ROUTER, "verifier wired to router");
        assertEq(pool.lockImageId(), LOCK_ID, "lock id wired");
        assertEq(pool.unlockImageId(), UNLOCK_ID, "unlock id wired");
        assertEq(pool.seizeImageId(), SEIZE_ID, "seize id wired");
        assertEq(pool.relayer(), RELAYER, "relayer wired");
        assertEq(address(pool.wstETH()), address(wsteth), "wstETH wired");
        assertEq(wsteth.stEthPerToken(), 1e18, "initial rate 1e18");
    }

    function test_revertsOnZeroImageId() public {
        vm.expectRevert(bytes("image ids required (set LOCK/UNLOCK/SEIZE_IMAGE_ID from CI image-ids.json)"));
        script.deploy(ROUTER, bytes32(0), UNLOCK_ID, SEIZE_ID, RELAYER);
    }

    function test_revertsOnDuplicateImageId() public {
        vm.expectRevert(bytes("image ids must be distinct (one per guest)"));
        script.deploy(ROUTER, LOCK_ID, LOCK_ID, SEIZE_ID, RELAYER);
    }

    function test_revertsOnCodelessVerifier() public {
        vm.expectRevert(bytes("verifier has no code at this address"));
        script.deploy(address(0xDEAD), LOCK_ID, UNLOCK_ID, SEIZE_ID, RELAYER);
    }
}
