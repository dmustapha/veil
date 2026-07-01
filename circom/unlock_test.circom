pragma circom 2.2.2;
include "unlock.circom";
component main {public [rootPool, rootRepaid]} = Unlock(16);
