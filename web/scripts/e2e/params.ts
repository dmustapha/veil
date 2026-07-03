// Shared constants for the Phase-6d live deposit→lock→borrow e2e (a scripted, single-note demo on the
// deployed hybrid suite). These are the ONE note's openings + the empty-tree zero-siblings; nothing
// here is secret in a demo sense (a real user's note fields would be device-local randomness).
//
// The whole flow needs NO off-chain Poseidon2: `spendPk` is the known `H1(nk=5, 0x34)` constant
// (cross-checked by the Rust `spend_pk_from_nk` vector and circom/lock_input.json), the merkle
// siblings are the committed empty-tree zeros (circom/merkle_proof_input.json), and `C_available` is
// read from the on-chain Deposit event. snarkjs computes every commitment/nullifier in-circuit.
//
// ⚠️ GUARD (audit M-01): these are DEMO-ONLY low-entropy openings (nk=5, blindings 1/7, …). A note's
// nullifier is deterministic in nk and its commitment is H(amount, spendPk, blinding, …), so guessable
// openings would let an observer brute-force a note off its on-chain commitment. NEVER import this file
// into the 6e web app — a real note must draw nk/blindings/loanSecret from a CSPRNG
// (crypto.getRandomValues) reduced into [0, BN254_R), with spendPk = H1(nk, 0x34) derived on-device.
// The e2e entrypoints set VEIL_E2E=1 (see package.json e2e:* scripts); anything else throws here.
if (typeof process === "undefined" || process.env.VEIL_E2E !== "1") {
  throw new Error("params.ts holds e2e demo constants — never import outside the VEIL_E2E harness");
}

/** nk=5 → spendPk = H1(nk, DS_NK=0x34). Matches circom/lock_input.json + notes::spend_pk_from_nk. */
export const NK = 5n;
export const SPEND_PK =
  2959944021135107534354482395319063899239552202030878317183496805275873812658n;

/** The single demo note: hidden collateral 2e15 (mock VEILC units); proven floor 1e15 (< amount, so
 *  the borrow discloses only a lower bound). Both ≥ the vault's 1e11 min_threshold; the loan sizes to
 *  ~1.1 USDC at ETH≈$1.6k (well under the 9 USDC LP), and stays < 9 USDC across any realistic price. */
export const AMOUNT = 2_000_000_000_000_000n; // 2e15
export const THRESHOLD = 1_000_000_000_000_000n; // 1e15
export const BLINDING_IN = 1n; // AVAILABLE note blinding (deposit)
export const BLINDING_OUT = 7n; // LOCKED note blinding (mint)
// NOTE: LOCK_ID + R are now B1′-linked (lockId = Poseidon2(C0, r, 0x35)). These demo constants
// pre-date the B1′ constraint. A live e2e must derive lockId from C0+r (Task 12 e2e update).
export const LOCK_ID = 3n;
export const R = 1n; // placeholder; live e2e must use r = randomFieldElement() → lockId = hash2(C0,r,0x35)
export const LOAN_SECRET = 4n;

/** Empty depth-16 tree zero-siblings (circom/merkle_proof_input.json = get_zeroes[0..15]). The
 *  AVAILABLE note at leaf 0 proves membership with ALL of these; the LOCKED note at leaf 1 proves with
 *  [C_available, ZEROS[1..15]] (its level-0 sibling is leaf 0). */
export const ZEROS: bigint[] = [
  16820622405745174042249830601237189755928192602553897283642901160942722677198n,
  15359050681704068253727521732087759823223946488317706303920832946299986235400n,
  6671095670782301971433680779252611368794999320551466812674353318786817161024n,
  2898530884683942979768330395206576452557152136232296043591186479403762235543n,
  2879429835226299550189553787486868267114983869369763300964302542438202562182n,
  11566551566833248982804491834987496395634853997927932418962431202486620538724n,
  18312102343585188862241826829911822382205993342087453656483747193932088506816n,
  14224209785328822587607423535934963302697475128513779413243648192259251120844n,
  11095627874297306182376029332709185052812444271679323433770968369044736864771n,
  18704999456835296287788791351223869084488976505945213474169158574576063641344n,
  2302223575749844940221218608817648865122641281382153518325924961250440546344n,
  9941822651518456549870765429353364121618236333686570285006226001759191620829n,
  305161669634951807424169523926880333018430532450295869001340858148392026582n,
  4303030743953968471832024899780716965231958504378042261854835816738234746741n,
  15195909102792637901645462881831419108429141638036540212053349388152520754306n,
  9874365816014053983788087933839297706692469290401227073021930460914214425685n,
];

/** veil-spike (the depositor + borrower for the demo). */
export const SPIKE = "GABHHKTQVGUQPZMXYJIP6OESTUS6QQA3AICEQI77B4FORUW4CPIVFXIF";

/** Render a SorobanProof's a/b/c byte arrays into the `stellar contract invoke --proof '{...}'` JSON. */
export function proofJson(a: Uint8Array, b: Uint8Array, c: Uint8Array): string {
  const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");
  return JSON.stringify({ a: hex(a), b: hex(b), c: hex(c) });
}
