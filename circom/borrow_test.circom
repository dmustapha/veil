pragma circom 2.2.2;
include "borrow.circom";
component main {public [root, threshold, borrower]} = Borrow(16);
