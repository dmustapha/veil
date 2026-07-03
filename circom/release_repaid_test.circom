pragma circom 2.2.2;
include "release_repaid.circom";
component main {public [C0, recipient, rootPool, rootRepaid]} = ReleaseRepaid(16);
