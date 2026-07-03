// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// TEMPORARY Phase-0 probe (not committed): canonical contract-based Axelar GMP send.
interface IGatewayP { function callContract(string calldata,string calldata,bytes calldata) external; }
interface IGasP { function payNativeGasForContractCall(address,string calldata,string calldata,bytes calldata,address) external payable; }
contract AxelarProbe {
    IGatewayP public gw; IGasP public gs;
    constructor(address g, address s){ gw=IGatewayP(g); gs=IGasP(s); }
    function send(string calldata chain, string calldata dest, bytes calldata payload) external payable {
        gs.payNativeGasForContractCall{value:msg.value}(address(this), chain, dest, payload, msg.sender);
        gw.callContract(chain, dest, payload);
    }
}
