// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VeilEthLock} from "../src/VeilEthLock.sol";
import {DepositFromEthVerifier} from "../src/DepositFromEthVerifier.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

/// @title Deploy Veil v3 cross-chain collateral leg to Ethereum (Sepolia).
/// @notice Phase 7f. Deploys the three pieces of the Ethereum lock leg, in order:
///           1. DepositFromEthVerifier — snarkjs Groth16 verifier for the `deposit_from_eth` opening
///              circuit (public signals `[amount, C]`). No constructor args.
///           2. MockWstETH — freely-mintable WETH stand-in the borrower locks (Lido's Sepolia token
///              is deprecated; real mainnet WETH/wstETH is a drop-in for `weth_`).
///           3. VeilEthLock — escrows the WETH and verifies the opening proof on-chain, binding the
///              locked amount to the note commitment `C` where the collateral lives.
///
///         A relayer then mirrors each `Locked(C, amount, owner)` event into the Soroban veil-pool
///         (`attest_lock`), where the shielded borrow proceeds.
///
/// Required env:
///   PRIVATE_KEY   deployer key (contracts/escrow/.env; also the disclosed-trust relayer/admin)
///
/// Usage:
///   dry-run:   forge script script/DeployEthLock.s.sol:DeployEthLock
///   broadcast: forge script script/DeployEthLock.s.sol:DeployEthLock \
///                --rpc-url "$SEPOLIA_RPC_URL" --broadcast
contract DeployEthLock is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        (DepositFromEthVerifier verifier, MockWstETH weth, VeilEthLock lock) = deploy();
        vm.stopBroadcast();

        console2.log("== Veil v3 Sepolia eth-lock deploy (7f) ==");
        console2.log("deployer              :", deployer);
        console2.log("DepositFromEthVerifier:", address(verifier));
        console2.log("MockWstETH (weth)     :", address(weth));
        console2.log("VeilEthLock           :", address(lock));
    }

    /// @dev Deployment logic, isolated from env/broadcast so it is unit-testable offline. VeilEthLock
    ///      is wired to the freshly-deployed verifier + WETH; the wiring is immutable (constructor).
    function deploy()
        public
        returns (DepositFromEthVerifier verifier, MockWstETH weth, VeilEthLock lock)
    {
        verifier = new DepositFromEthVerifier();
        weth = new MockWstETH();
        lock = new VeilEthLock(address(weth), address(verifier));
    }
}
