// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VeilEthLock} from "../src/VeilEthLock.sol";
import {DepositFromEthVerifier} from "../src/DepositFromEthVerifier.sol";

/// @title Deploy Veil v3 cross-chain collateral leg to Ethereum (Sepolia) — Axelar-attested, real WETH.
/// @notice Deploys the opening-proof verifier + VeilEthLock wired to REAL canonical Sepolia WETH and the
///         Sepolia Axelar gateway + gas service. VeilEthLock escrows real wrapped ETH and emits the
///         `(C, amount)` attestation to the Soroban veil-pool over Axelar GMP (no mock collateral, no
///         trusted relayer). `setDestination(<veil-pool strkey>)` is called separately AFTER the Soroban
///         pool is deployed (resolves the pool↔lock address cycle).
///
/// Required env:
///   PRIVATE_KEY   deployer key (contracts/escrow/.env; becomes VeilEthLock owner)
///
/// Usage:
///   dry-run:   forge script script/DeployEthLock.s.sol:DeployEthLock
///   broadcast: forge script script/DeployEthLock.s.sol:DeployEthLock \
///                --rpc-url "$SEPOLIA_RPC_URL" --broadcast
contract DeployEthLock is Script {
    /// Uniswap's canonical Wrapped Ether on Sepolia (real WETH — deposit() wraps real ETH 1:1, no mint).
    address internal constant SEPOLIA_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    /// Axelar testnet contracts on Ethereum Sepolia (chain name "ethereum-sepolia").
    address internal constant SEPOLIA_AXELAR_GATEWAY = 0xe432150cce91c13a887f7D836923d5597adD8E31;
    address internal constant SEPOLIA_AXELAR_GAS_SERVICE = 0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        (DepositFromEthVerifier verifier, VeilEthLock lock) = deploy();
        vm.stopBroadcast();

        console2.log("== Veil v3 Sepolia eth-lock deploy (Axelar, real WETH) ==");
        console2.log("deployer              :", deployer);
        console2.log("DepositFromEthVerifier:", address(verifier));
        console2.log("canonical WETH        :", SEPOLIA_WETH);
        console2.log("VeilEthLock           :", address(lock));
        console2.log("axelar gateway        :", SEPOLIA_AXELAR_GATEWAY);
        console2.log("axelar gas service    :", SEPOLIA_AXELAR_GAS_SERVICE);
        console2.log(">>> next: lock.setDestination(<veil-pool strkey>) after the Soroban pool deploys");
    }

    /// @dev Deployment logic, isolated from env/broadcast so it is unit-testable offline. VeilEthLock is
    ///      wired to the canonical WETH, the fresh opening-proof verifier, and the Sepolia Axelar leg.
    function deploy() public returns (DepositFromEthVerifier verifier, VeilEthLock lock) {
        require(SEPOLIA_WETH.code.length > 0, "no WETH code at canonical address");
        require(SEPOLIA_AXELAR_GATEWAY.code.length > 0, "no Axelar gateway code");
        verifier = new DepositFromEthVerifier();
        lock = new VeilEthLock(
            SEPOLIA_WETH, address(verifier), SEPOLIA_AXELAR_GATEWAY, SEPOLIA_AXELAR_GAS_SERVICE
        );
    }
}
