// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VeilPool, IRiscZeroVerifier, IWstETH} from "../src/VeilPool.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

/// @title Deploy Veil v2 pool to Ethereum (Sepolia).
/// @notice Deploys MockWstETH (freely mintable, settable stEthPerToken) then VeilPool wired to the
///         canonical RISC Zero verifier router and the REAL lock/unlock/seize image_ids produced by
///         CI (`.github/workflows/prove.yml` → image-ids.json). The router only accepts REAL Groth16
///         receipts, so the image_ids MUST be the CI-baked ones — dev-mode ids will never verify.
///
/// Required env:
///   PRIVATE_KEY       deployer key (also the default relayer/admin — disclosed trust)
///   LOCK_IMAGE_ID     bytes32, real lock guest image_id   (from image-ids.json)
///   UNLOCK_IMAGE_ID   bytes32, real unlock guest image_id
///   SEIZE_IMAGE_ID    bytes32, real seize guest image_id
/// Optional env:
///   RISC0_VERIFIER    verifier address (default = Sepolia RiscZeroVerifierRouter)
///   RELAYER_ADDRESS   root/soroban/liquidated relayer (default = deployer)
///
/// Usage:
///   dry-run:  forge script script/DeployVeilPool.s.sol:DeployVeilPool
///   broadcast: forge script script/DeployVeilPool.s.sol:DeployVeilPool \
///                --rpc-url "$SEPOLIA_RPC_URL" --broadcast
contract DeployVeilPool is Script {
    /// Canonical RiscZeroVerifierRouter on Ethereum Sepolia (routes zkVM 3.0.x receipts). Docs +
    /// risc0-ethereum deployment.toml + Etherscan, cross-confirmed.
    address internal constant SEPOLIA_RISC0_ROUTER = 0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187;

    /// Depth-16 shielded tree (locked design decision 4).
    uint32 internal constant LEVELS = 16;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address verifier = vm.envOr("RISC0_VERIFIER", SEPOLIA_RISC0_ROUTER);
        address relayer = vm.envOr("RELAYER_ADDRESS", deployer);

        bytes32 lockId = vm.envBytes32("LOCK_IMAGE_ID");
        bytes32 unlockId = vm.envBytes32("UNLOCK_IMAGE_ID");
        bytes32 seizeId = vm.envBytes32("SEIZE_IMAGE_ID");

        vm.startBroadcast(pk);
        (MockWstETH wsteth, VeilPool pool) = deploy(verifier, lockId, unlockId, seizeId, relayer);
        vm.stopBroadcast();

        console2.log("== Veil v2 Sepolia deploy ==");
        console2.log("deployer   :", deployer);
        console2.log("MockWstETH :", address(wsteth));
        console2.log("VeilPool   :", address(pool));
        console2.log("verifier   :", verifier);
        console2.log("relayer    :", relayer);
        console2.logBytes32(lockId);
        console2.logBytes32(unlockId);
        console2.logBytes32(seizeId);
    }

    /// @dev Deployment logic, isolated from env/broadcast so it is unit-testable offline. Guards
    ///      against un-set / dev-mode / duplicated ids (the router would reject the seals, or the
    ///      wrong guest would gate a mechanic). Real lock/unlock/seize ids are non-zero and distinct.
    function deploy(
        address verifier,
        bytes32 lockId,
        bytes32 unlockId,
        bytes32 seizeId,
        address relayer
    ) public returns (MockWstETH wsteth, VeilPool pool) {
        require(
            lockId != bytes32(0) && unlockId != bytes32(0) && seizeId != bytes32(0),
            "image ids required (set LOCK/UNLOCK/SEIZE_IMAGE_ID from CI image-ids.json)"
        );
        require(
            lockId != unlockId && lockId != seizeId && unlockId != seizeId,
            "image ids must be distinct (one per guest)"
        );
        require(verifier.code.length > 0, "verifier has no code at this address");

        wsteth = new MockWstETH();
        pool = new VeilPool(
            LEVELS,
            IRiscZeroVerifier(verifier),
            lockId,
            unlockId,
            seizeId,
            relayer,
            IWstETH(address(wsteth))
        );
    }
}
