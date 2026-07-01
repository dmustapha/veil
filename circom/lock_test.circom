pragma circom 2.2.2;
include "lock.circom";
component main {public [root, lockId]} = Lock(16);
