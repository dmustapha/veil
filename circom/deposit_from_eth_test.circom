pragma circom 2.2.2;
include "deposit_from_eth.circom";
// Public signals in snarkjs order: [amount, C] (nPublic = 2).
component main {public [amount, C]} = DepositFromEth();
