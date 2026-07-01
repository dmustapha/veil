pragma circom 2.2.2;

include "note_commitment.circom";
include "circomlib/circuits/bitify.circom";

// Veil v3 DEPOSIT-FROM-ETH opening proof (client-side-provable).
//
// Binds an AVAILABLE note commitment `C` to a PUBLIC `amount` via a secret opening (spendPk, blinding):
//   C == NoteCommitment(DS_NOTE_AVAILABLE=0x10, amount, spendPk, blinding, aux=0)
//
// Verified by VeilEthLock.sol AT LOCK TIME (a snarkjs-exported Solidity Groth16 verifier), so the
// amount of WETH escrowed on Ethereum provably matches the note the user will later spend on Stellar —
// a user cannot lock `amount` WETH yet commit to a larger note (which would drain the USDC LP). The
// note's secret key material never leaves the device; only `C` and `amount` are public (and `amount`
// is already public — it is the WETH locked on Ethereum).
//
//   Public signals (snarkjs order = declaration order): [amount, C]
//   Private: spendPk, blinding
template DepositFromEth() {
    // --- public ---
    signal input amount;   // the WETH amount locked on Ethereum (public)
    signal input C;        // the AVAILABLE note commitment being bound (public)
    // --- private ---
    signal input spendPk;
    signal input blinding;

    // Range-bind amount to u128 to match the pool's 16-byte amount field (defense-in-depth against a
    // field-wrapping amount, mirroring the other circuits).
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;

    // Recompute the AVAILABLE note commitment from the opening and require it equals the public C.
    component note = NoteCommitment();
    note.domainSep <== 16; // DS_NOTE_AVAILABLE (0x10)
    note.amount    <== amount;
    note.spendPk   <== spendPk;
    note.blinding  <== blinding;
    note.aux       <== 0;
    note.out === C;
}
