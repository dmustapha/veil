pragma circom 2.2.2;
include "seize.circom";
component main {public [rootPool, rootLiquidated, seized]} = Seize(16);
