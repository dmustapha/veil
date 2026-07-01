# Veil v3 — Circom circuits (Soroban-native, BN254)

Bespoke Groth16 circuits for client-side (in-browser) proving, verified on Soroban.

## Poseidon2 (`poseidon2/`)
The Poseidon2 permutation/compress circuits are derived from **Nethermind's
`stellar-private-payments`** (Apache-2.0) — the proven reference whose Circom `PoseidonCompress`
and Soroban `poseidon2_compress` are already matched. We reuse their **BN254, t=2, d=5, R_F=8,
R_P=56** parameters verbatim so the circuit hash is byte-identical to the on-chain
`env.crypto_hazmat().poseidon2_permutation("BN254", …)` host function (CAP-0075 / Protocol 26).

Compression rule (both sides): `out = permutation(x)[0] + x[0] (mod p)`.

## GATE-ZERO cross-impl vector (the Poseidon analogue of v2's five SHA-256 vectors)
`PoseidonCompress(1, 2)` must equal, byte-for-byte, the Soroban `poseidon2_compress(1, 2)`:

```
0x0e90c132311e864e0c8bca37976f28579a2dd9436bbc11326e21ec7c00cea5b3
= 6588139247708940112588203339651261153905233202198520634825199962343944922547
```

Locked from the Circom side (compile `compress_test.circom` + witness on input `{inputs:[1,2]}`).
The Soroban side (soroban-sdk v26, hazmat Poseidon2) must reproduce it before any pool/circuit code.

## GATE-T3 cross-impl vector (the note-commitment primitive)
The note commitment is a domain-separated chain of the **t=3** hash `Poseidon2(2)` (2 inputs + a
`domainSeparation` capacity element → `Permutation(3)`, output `perm.out[0]`, no compression add).
Soroban's `poseidon2_hash2(a, b, sep)` must byte-match it. `Poseidon2(2)` on inputs `[1, 2]` with
`domainSeparation = 3`:

```
0x0a799a621cac2cea1ec6fdbcd5dc92cadd31c210c912aaca009aca578d210768
= 4737982494702600552753609419126955242994596445692557044681458296415162795880
```

Locked from the Circom side (compile `hash2_test.circom` + witness on input
`{inputs:[1,2], domainSeparation:3}`); reproduced on the Soroban side in `gate_t3_test`.

## Note commitment (`note_commitment.circom`)
Port of v2's SHA-256 `note_commitment` to a domain-separated chain of `Poseidon2(2)`:

```
C = H( H( H(amount, spendPk, ds), blinding, ds), aux, ds )      H = Poseidon2(2)
ds = DS_NOTE_AVAILABLE (0x10) | DS_NOTE_LOCKED (0x11)           aux = lockId (0 for AVAILABLE)
```

The note DOMAIN (v2's `domain` byte) is carried by `ds`; joinsplit circuits wire it to a fixed
constant per note role. Cross-impl vectors (compile `note_commitment_test.circom`, witness
`note_commitment_input.json`; reproduced on Soroban in `note_commitment_test`):

```
AVAILABLE  ds=0x10, amount=2e18, spendPk=2, blinding=1, aux=0
  = 0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10d
LOCKED     ds=0x11, amount=2e18, spendPk=2, blinding=1, aux=3
  = 0x1c7441b2dd964a0b1f0f22dc590351ced0082c6edf10f7cbe2871d0c29112f9a
```

## Nullifier hash (`nullifier.circom`)
Port of v2's SHA-256 `nullifier(nk, C, leafIndex)` to a `DS_NF`-separated chain of `Poseidon2(2)`:

```
nf = H( H(nk, C, DS_NF), leafIndex, DS_NF )      H = Poseidon2(2)
DS_NF = 0x20   (distinct from the note domains 0x10/0x11 → no hash collides across roles)
```

Circuit-only in v2 (computed by the browser prover + note client, never on-chain); the Soroban
`notes::nullifier` is a reference impl that locks the cross-vector. `Nullifier` on
`(nk=5, C=7, leafIndex=3)` (compile `nullifier_test.circom`, witness `nullifier_input.json`;
reproduced on Soroban in `nullifier_hash_test`):

```
0x0d0e7dc8c792f33c6cee9f8bfcd95e5ccaed253ca11dbf31aa7af6b5d7909013
= 5905671021789640503695739615972304829318177619592056643404543986320060485651
```

## Merkle membership (`merkle_proof.circom`) + deposit↔circuit consistency lock
Depth-parametric Poseidon2 membership (adapted from Nethermind, Apache-2.0), using the t=2
`PoseidonCompress` for internal nodes — byte-identical to the Soroban `poseidon2_compress`.
`Num2Bits`/`Switcher` come from `circomlib` (pinned in `package.json`; `npm i` in `circom/` to
restore `node_modules`, then compile with `-l node_modules`).

**DEPOSIT-ROOT MEMBERSHIP VECTOR** (the deposit↔circuit lock deferred from Phase 1): the Soroban
veil-pool root after ONE deposit of the canonical AVAILABLE note (leaf `0x01c209ef…`) equals
`MerkleProof(16)` for that leaf at index 0 with the `get_zeroes[0..16]` siblings, pathIndices=0:

```
0x150d7055c4e2e796814f44c6ef83250670f7d8f0efc2012c683b5cee383bf33c
= 9522314140011572725022969565431319453700121595450358291806547786130838516540
```

Reproduced on Soroban in `deposit_root_matches_circom_merkleproof_membership_vector` (deposits the
note, asserts `pool.root()` equals this literal). If the on-chain incremental tree and the circuit's
membership fold ever diverge, a deposited note becomes unprovable in the browser.

## Domain hashes (`domain_hash.circom`) + joinsplit circuits
`DomainHash1(x, ds) = Poseidon2(2)(x, 0, ds)` is the single-input hash family (position_id 0x30,
lock_handle 0x31, repaid_leaf 0x32, liquidated_leaf 0x33), locked against Soroban `notes` in
`domain_hash_test`. lock_handle / repaid_leaf / liquidated_leaf are load-bearing: the Phase-4 vault
inserts the leaves on-chain and the unlock/seize circuits prove their membership.

The joinsplit circuits port `guest/core/src/notes.rs` (Groth16, client-side-provable). Each composes
`NoteCommitment` + `MerkleProof(16)` + (for spends) `Nullifier`, with u128 amounts range-bound by
`Num2Bits(128)` before any `GreaterEqThan` (comparators don't range-check their inputs).

- **`borrow.circom`** — port of `verify_borrow`. Public: root, threshold, borrower; outputs
  positionId, lockHandle. Proves a LOCKED note of hidden amount ≥ threshold is in the pool root.
  ~5.1k non-linear constraints. groth16 prove/verify **OK**; a below-threshold amount is unprovable
  (witness fails the `amount ≥ threshold` constraint — the ZK is load-bearing).

- **`lock.circom`** — port of `verify_lock`. Public: root, lockId; outputs nullifierOut,
  commitmentOut. Spends one AVAILABLE note (membership + published nullifier) → mints one LOCKED note
  of the SAME amount bound to lockId. Value conserved structurally (one `amount` feeds both
  commitments → no inflation possible). ~5.4k non-linear. groth16 OK; tampered membership unprovable.

- **`unlock.circom`** — port of `verify_unlock`. Public: rootPool, rootRepaid; outputs nullifierOut,
  commitmentOut. Spends a LOCKED note (membership + nullifier) → mints an AVAILABLE note of the SAME
  amount, GATED on the repay-proof: `repaid_leaf(lock_handle(lockId))` must be a member of the
  repaid-tree root. Both roots are Soroban Poseidon trees. ~9.4k non-linear. groth16 OK; tampering
  EITHER the pool path or the repaid path is unprovable (no collateral recovery without repay — the
  core invariant).

- **`seize.circom`** — port of `verify_seize`. Public: rootPool, rootLiquidated, seized; outputs
  nullifierOut, commitmentLiquidator, commitmentChange. Spends a LOCKED note GATED on the
  default-proof (`liquidated_leaf(lock_handle(lockId))` ∈ liquidated root) → liquidator note worth the
  public `seized` floor + change note worth the hidden `amount - seized`. Conserved: `seized + change
  == amount`, `amount >= seized`. ~10.5k non-linear. groth16 OK; over-seize (seized > amount) and a
  non-liquidated position (tampered liquidated path) are both unprovable.

## Phase-2 security review (self + security-auditor subagent)
Findings and dispositions:

- **C-01 (CRITICAL, FIXED)** — `nk` was a free witness the note never bound, so one note could yield
  unlimited distinct nullifiers → double-spend / unbounded mint / insolvency. **Fix:** the note's
  `spendPk` is now the nullifier-key commitment, `spendPk = H1(nk, DS_NK=0x34)` (`notes::spend_pk_from_nk`,
  cross-vector `spend_pk_from_nk_matches_circom_vector`), and each spend circuit constrains
  `nkBind.out === spendPk`. A note now determines exactly one `nk` → one nullifier; a `spendPk ≠ H1(nk)`
  witness is unprovable. Deposits stay key-agnostic (the client derives `spendPk` this way).
- **M-02 (MEDIUM, FIXED)** — `lock`/`unlock` copied `amount` into output commitments without a range
  check. Added `Num2Bits(128)` on `amount` in both (borrow/seize already had it). Defense-in-depth
  against a field-wrapping amount faking conservation.
- **L-01/L-02/L-03/L-04 (confirmed sound)** — `borrower` is bound by being a Groth16 public input;
  domain tags 0x10/0x11/0x20/0x30–0x34 are collision-free; the nullifier's `leafIndex` is the same
  signal as the membership `pathIndices`; seize conservation `seized + change == amount` cannot
  field-overflow.

### Phase-4 vault obligations (the circuits assume these; the vault MUST enforce them)
1. Persist every published nullifier and reject replays (double-spend set).
2. Verify each public root ∈ its known-root history window (pool / repaid / liquidated).
3. Use a DISTINCT Groth16 vkey per circuit so a `lock` proof can't be replayed as `unlock`/`seize`.
4. `borrow`: assert `borrower == hash(invoker)` (anti-replay) and prevent proof reuse.
5. Insert each output commitment into the pool tree; range-check `deposit` amounts to `[0, 2^128)`.

## Trusted-setup smoke (per-circuit, local)
Phase-2 smoke only (the real per-circuit ceremony is Phase 3). Shared powers-of-tau `ptau/` (bn128,
2^15) → per-circuit `groth16 setup` → `prove` → `verify`. ptau/zkey/proof/public/vkey all gitignored.

## Build (artifacts gitignored)
```
circom compress_test.circom --r1cs --wasm --sym -o .
node compress_test_js/generate_witness.js compress_test_js/compress_test.wasm input.json out.wtns
snarkjs wtns export json out.wtns out.json
```
