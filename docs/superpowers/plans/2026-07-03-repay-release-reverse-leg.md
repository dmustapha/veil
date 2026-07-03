# Veil v3 Repay-Release Reverse Leg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stellar→Ethereum reverse leg so that after a shielded loan is repaid on `veil-vault`, the borrower can release their real WETH escrowed in `VeilEthLock` on Sepolia — via a browser-proved `release_repaid` circuit, an evolved `veil-pool` that emits an outbound Axelar GMP message, and a `VeilEthLock` v2 that executes the release.

**Architecture:** B1′ binds the Ethereum escrow key `C0` into the LOCKED note's `lockId` derivation (`lockId = Poseidon2(C0, r)`, `r` secret) — a one-constraint change to `lock.circom` that leaves the note *structure* (and thus `unlock`/`seize`/`borrow`/`deposit` circuits+verifiers) untouched, requiring only a redeployed `lock` verifier. A new `release_repaid` circuit reveals `C0`, proves the LOCKED note is owned, in-pool, repaid, and bound to `C0`, and publishes a nullifier. The pool's new `release_repaid` entrypoint verifies the proof, gates on the live repaid root, spends the nullifier, and emits `call_contract`+`pay_gas` to `VeilEthLock` v2, which validates the Axelar source and transfers the full WETH to the borrower's EVM address. Transport is symmetric with the proven inbound deposit leg (Axelar Amplifier, one trust anchor both directions).

**Tech Stack:** circom 2.2.2 + snarkjs Groth16 (BN254); Soroban Rust (soroban-sdk `=27.0.0-rc.1`, `wasm32v1-none`); Solidity `^0.8.24` + Foundry; Next.js + TypeScript + snarkjs (browser) + viem v2 + @stellar/stellar-sdk v16; vitest.

## Global Constraints

- **Branch:** `v3-soroban-native`. Do NOT touch `main`, `v1-working`, `v2-private-margin-lending`, or tag `v2-riscezero-deployed`.
- **DO NOT MODIFY** the deployed/proven Phase-7 artifacts: the `deposit_from_eth`, `borrow`, `unlock`, `seize` circuits + their verifiers, the OLD `veil-pool`, the OLD `lock` verifier, `veil-vault`, and `VeilEthLock` `0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2`. B1′ deploys a NEW `lock` circuit/verifier + NEW pool ALONGSIDE them; the reverse e2e re-locks on the new pool (fresh e2e).
- **Scope:** v1 = **repay-release only**. `release_liquidated.circom`, seize-side recipient binding, and any `vault.liquidate` change are OUT OF SCOPE (deferred to the shielded-WETH-pool milestone). `veil-vault` needs **no change** — `vault.repay` already advances `repaid_root`.
- **B1′ binding (locked):** `lockId === Poseidon2(C0, r)`, `C0 = cin.out` (the AVAILABLE input note), `r` a fresh secret random. Domain separator for the binding is **`DS_LOCKBIND = 0x35`** (next free tag; existing tags 0x10,0x11,0x20,0x30–0x34). Both `lock.circom` and `release_repaid.circom` and the JS witness builder MUST use `0x35`.
- **Note structure is immutable:** `C = H(H(H(amount,spendPk,ds),blinding,ds),aux,ds)` with `aux = lockId` for LOCKED notes. B1′ constrains `lockId`'s *derivation*, never the note structure.
- **soroban-sdk pinned** `=27.0.0-rc.1`, `--target wasm32v1-none`. **No Axelar crate** in Rust — hand-write `#[contractclient]` traits (protocol-level ScVal args), matching the existing `AxelarGatewayIface`.
- **Recipient field-encoding:** the borrower EVM address is bound into the proof as `recipient_field = keccak256(evm_addr_bytes) mod BN254_R` (mirror `veil-vault`'s `borrower_field`). The Axelar payload carries the RAW 20-byte address for the WETH transfer.
- **Axelar identifiers rotate:** the Stellar Amplifier chain name (`stellar-2026-q1-2` current) rotates quarterly — re-verify via `getChains` immediately before deploy, never hardcode into a redeploy without re-checking. Destination-address string `0x` format (§5.3) is unresolved — test empirically on the live route.
- **Atomicity:** in `release_repaid`, `try_spend(nullifier)` then the Axelar emit run in the SAME tx — a trap on emit reverts the nullifier spend (no "note burned, WETH never released" state).
- **Double-release guards (two):** pool `try_spend(nullifierC1)` + Ethereum `released[C0]`.

---

## File Structure

**Circuits (`circom/`)**
- `lock.circom` — MODIFY: add `signal input r`, constraint `lockId === Poseidon2(cin.out, r, 0x35)`.
- `release_repaid.circom` — CREATE: the reverse joinsplit (mirrors `unlock.circom` + reveals `C0` + binds `recipient`).
- `release_repaid_test.circom` — CREATE: `component main {public [C0, recipient, rootPool, rootRepaid]} = ReleaseRepaid(16);`
- `ceremony.sh` — MODIFY: add `release_repaid` to the loop; `lock` already present (re-run regenerates its VK).
- `gen_fixtures.js` — MODIFY: add `release_repaid` to the circuits array (embeds VK for Soroban verifier tests).
- `lock_input.json` — REGENERATE: add `r`, set `lockId = Poseidon2(C0, r, 0x35)`.
- `release_repaid_input.json` — CREATE: canonical witness (valid) + `release_repaid_attack_input.json` (insolvency attack, must fail).
- `keys/lock.vk.json`, `keys/release_repaid.vk.json` — regenerated / new (committed).

**Soroban (`contracts/`)**
- `veil-verifier/src/lib.rs` — UNCHANGED code; rebuilt twice with `VERIFIER_VK_JSON` = new `lock` VK and `release_repaid` VK → two new deployed verifier contracts.
- `veil-pool/src/lib.rs` — MODIFY: new `ConfigKey`s (`ReleaseVerifier`, `AxelarGasService`, `GasToken`, `GasBudget`), new client traits (`AxelarGatewayMessagingIface`, `AxelarGasServiceIface`) + `Token` type, `set_axelar_outbound` one-time setter, `__constructor` gains `release_verifier`, new `release_repaid` entrypoint + `recipient_field`/`emit_release` helpers + `ReleaseEmitted` event + `BN254_R` const.
- `veil-pool/src/notes.rs` — UNCHANGED (note structure preserved).

**Solidity (`contracts/escrow/`)**
- `src/VeilEthLock.sol` — the DEPLOYED v1 is left alone; create `src/VeilEthLockV2.sol` (lock + `execute` release).
- `test/VeilEthLockV2.t.sol` — CREATE: Foundry tests (release happy path + guards).
- `script/DeployEthLockV2.s.sol` — CREATE.

**Web (`web/`)**
- `lib/prove/lock.ts` — MODIFY: `r` in `LockNote`/`LockWitness`/validation/return.
- `lib/prove/release.ts` — CREATE: `buildReleaseWitness`.
- `lib/prove/groth16.ts` — MODIFY: `RELEASE_ASSETS`, `proveRelease`, `publicSignalsToReleaseArgs`.
- `lib/app/notes.ts` — MODIFY: `r` field, `lockId = Poseidon2(C0,r)` in `createNote`, `repaid`/`released` statuses, `toReleaseNote`.
- `lib/app/stellar.ts` — MODIFY: `releaseRepaid` invoke.
- `lib/app/eth.ts` — MODIFY: `isReleased` read.
- `lib/app/pipeline.ts` — MODIFY: `REPAY_STEPS`, `runRepayPipeline`.
- `lib/onchain.ts` — MODIFY: new addresses + `VEIL_RELEASE_VERIFIER` + reverse-gas constants.
- `components/app/RepayFlow.tsx` — CREATE (mirror `BorrowFlow.tsx`).
- `components/app/NoteCard.tsx` — MODIFY: pills + `RepayFlow` gate + tx facts.
- `app/globals.css` — MODIFY: `.pos-pill.released`.
- `scripts/vendor-circuits.sh` — MODIFY: add `vendor release_repaid`, keeps `vendor lock` (re-copies new VK).
- `scripts/gen-lock-fixture.ts` — CREATE (recomputes `lock_input.json` with `r`).
- `scripts/verify-release-prover.ts` — CREATE.
- `package.json` — MODIFY: `verify:release-prover` script.

---

## Task 1: B1′ — bind `C0` into `lock.circom`, recompile, new lock VK

**Files:**
- Modify: `circom/lock.circom`
- Create: `web/scripts/gen-lock-fixture.ts`
- Modify: `circom/lock_input.json` (regenerated)
- Modify: `circom/ceremony.sh` (verify `lock` in loop)
- Output: `circom/lock.zkey`, `circom/keys/lock.vk.json`, `circom/lock_test_js/lock_test.wasm`

**Interfaces:**
- Produces: a `lock` circuit whose public signals are UNCHANGED `[nullifierOut, commitmentOut, root, lockId]` (4), with a NEW private input `r` and the constraint `lockId === Poseidon2(cin.out, r, 0x35)`. New VK `keys/lock.vk.json`. Consumed by Task 3 (verifier), Task 9 (web witness/vendor).

- [ ] **Step 1: Add the binding constraint to `lock.circom`**

Add the explicit poseidon2 include near the top (after the existing includes, ~line 7):

```circom
include "poseidon2/poseidon2_hash.circom";
```

Add the new private input alongside the others (after `signal input blindingOut;`, ~line 31):

```circom
    signal input r; // B1' binding random: lockId = Poseidon2(C0, r)
```

Immediately after the nullifier block (after `nullifierOut  <== nf.out;`, ~line 67), add the binding. `cin.out` (= C0) is already in scope:

```circom
    // B1' — bind the Ethereum escrow key C0 into lockId (hiding: r secret random).
    // Necessary for reverse-leg solvency (release_repaid re-proves this exact binding).
    component lockBind = Poseidon2(2);
    lockBind.inputs[0] <== cin.out;
    lockBind.inputs[1] <== r;
    lockBind.domainSeparation <== 53; // DS_LOCKBIND = 0x35
    lockId === lockBind.out;
```

Leave everything else (public list `[root, lockId]`, `cout.aux <== lockId`) untouched.

- [ ] **Step 2: Recompile the lock circuit**

Run from `circom/`:

```bash
cd circom
circom lock_test.circom --r1cs --wasm --sym -o .
```

Expected: `lock_test.r1cs`, `lock_test.sym`, `lock_test_js/lock_test.wasm` regenerated, non-zero constraint count printed (~one Poseidon2 more than before), no errors.

- [ ] **Step 3: Write the fixture regenerator (adds `r`, recomputes `lockId`)**

`C0` does not depend on `lockId`, so the existing `lock_input.json`'s `C0`/path/amount/secrets stay valid — only `lockId` changes and `r` is added. Create `web/scripts/gen-lock-fixture.ts`:

```ts
// Recompute circom/lock_input.json for B1': set lockId = Poseidon2(C0, r, 0x35), add r.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { poseidon2Hash2 } from "@/lib/prove/poseidon2";
import { noteCommitment } from "@/lib/prove/notes";

const DS_NOTE_AVAILABLE = 0x10n;
const DS_LOCKBIND = 0x35n;
const path = resolve(__dirname, "../../circom/lock_input.json");
const inp = JSON.parse(readFileSync(path, "utf8"));

const amount = BigInt(inp.amount);
const spendPk = BigInt(inp.spendPk);
const blindingIn = BigInt(inp.blindingIn);

// C0 = NoteCommitment(0x10, amount, spendPk, blindingIn, aux=0) — the AVAILABLE input note (cin.out).
const c0 = noteCommitment(DS_NOTE_AVAILABLE, amount, spendPk, blindingIn, 0n);

// Deterministic non-zero r (canonical field element) for a reproducible fixture.
const r = 0x0d1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f70n;
const lockId = poseidon2Hash2(c0, r, DS_LOCKBIND);

inp.r = r.toString();
inp.lockId = lockId.toString();
writeFileSync(path, JSON.stringify(inp, null, 2) + "\n");
console.log("lock_input.json updated: C0=%s lockId=%s", c0.toString(), lockId.toString());
```

> If `poseidon2Hash2`'s signature differs (confirm in `web/lib/prove/poseidon2.ts`: it is the 2-input+domain hash used by `noteCommitment`), adapt the call to the exported name — do not invent one.

- [ ] **Step 4: Run the regenerator**

```bash
cd web && pnpm tsx scripts/gen-lock-fixture.ts
```

Expected: prints `lock_input.json updated: C0=… lockId=…`; `circom/lock_input.json` now contains an `r` field and a recomputed `lockId`.

- [ ] **Step 5: Re-run the ceremony for lock (new zkey + VK)**

`ceremony.sh` already loops `lock`. Run (regenerates all listed circuits' keys — acceptable, they are dev-ceremony keys):

```bash
cd circom && bash ceremony.sh
```

Expected: `circom/lock.zkey` and `circom/keys/lock.vk.json` regenerated; console shows `zkey export verificationkey` success for `lock`.

- [ ] **Step 6: Prove/verify smoke — valid witness passes, wrong `r` fails**

Generate the witness and prove:

```bash
cd circom
node lock_test_js/generate_witness.js lock_test_js/lock_test.wasm lock_input.json /tmp/lock.wtns
snarkjs groth16 prove lock.zkey /tmp/lock.wtns /tmp/lock_proof.json /tmp/lock_public.json
snarkjs groth16 verify keys/lock.vk.json /tmp/lock_public.json /tmp/lock_proof.json
```

Expected: final line `[INFO] snarkJS: OK!`.

Negative check — corrupt `r` so `lockId !== Poseidon2(C0, r)` and confirm witness generation (constraint) fails:

```bash
cd circom
node -e "const j=require('./lock_input.json'); j.r=(BigInt(j.r)+1n).toString(); require('fs').writeFileSync('/tmp/lock_bad.json',JSON.stringify(j))"
node lock_test_js/generate_witness.js lock_test_js/lock_test.wasm /tmp/lock_bad.json /tmp/lock_bad.wtns; echo "exit=$?"
```

Expected: witness generation ABORTS (`Assert Failed` on the `lockId === lockBind.out` constraint), `exit` non-zero.

- [ ] **Step 7: Commit**

```bash
git add circom/lock.circom circom/lock_input.json circom/lock.zkey circom/keys/lock.vk.json web/scripts/gen-lock-fixture.ts
git commit -m "feat(circom): B1' bind C0 into lockId derivation (lock circuit)"
```

---

## Task 2: `release_repaid.circom` — the reverse joinsplit + insolvency-attack test

**Files:**
- Create: `circom/release_repaid.circom`, `circom/release_repaid_test.circom`
- Create: `circom/release_repaid_input.json`, `circom/release_repaid_attack_input.json`
- Modify: `circom/ceremony.sh` (add `release_repaid`), `circom/gen_fixtures.js` (add `release_repaid`)
- Output: `circom/release_repaid.zkey`, `circom/keys/release_repaid.vk.json`

**Interfaces:**
- Consumes: the DS_LOCKBIND=0x35 binding and note structure from Task 1.
- Produces: a circuit with public signals **`[nullifierOut, C0, recipient, rootPool, rootRepaid]`** (5). VK `keys/release_repaid.vk.json`. Consumed by Task 3 (verifier), Task 5 (pool public-signal order), Task 10 (web prover).

- [ ] **Step 1: Write `release_repaid.circom`**

```circom
pragma circom 2.2.2;

include "note_commitment.circom";
include "merkle_proof.circom";
include "nullifier.circom";
include "domain_hash.circom";
include "poseidon2/poseidon2_hash.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Reverse leg: reveal C0 to release the Ethereum WETH escrow, gated on the LOCKED note C1 being
//   (a) in the pool tree, (b) owned by nk, (c) repaid, (d) bound to C0 via lockId = Poseidon2(C0, r).
// Public signal order (snarkjs): [nullifierOut, C0, recipient, rootPool, rootRepaid].
template ReleaseRepaid(levels) {
    // public inputs
    signal input C0;         // revealed AVAILABLE-note commitment; keys the Ethereum escrow
    signal input recipient;  // borrower EVM address, field-encoded (keccak(addr) mod r)
    signal input rootPool;
    signal input rootRepaid;

    // private inputs
    signal input amount;
    signal input blindingIn;   // the LOCKED note (C1) blinding
    signal input spendPk;
    signal input nk;
    signal input lockId;
    signal input r;            // B1' binding random
    signal input leafIndex;
    signal input pathElements[levels];
    signal input repaidLeafIndex;
    signal input repaidPathElements[levels];

    signal output nullifierOut;

    // (b) ownership: spendPk = H1(nk, DS_NK)
    component nkBind = DomainHash1();
    nkBind.x <== nk;
    nkBind.domainSep <== 52; // DS_NK
    nkBind.out === spendPk;

    // range-bind amount (prevents field aliasing)
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;

    // recompute C1 (LOCKED note, aux = lockId)
    component cin = NoteCommitment();
    cin.domainSep <== 17; // DS_NOTE_LOCKED
    cin.amount    <== amount;
    cin.spendPk   <== spendPk;
    cin.blinding  <== blindingIn;
    cin.aux       <== lockId;

    // (a) C1 membership in rootPool
    component mp = MerkleProof(levels);
    mp.leaf <== cin.out;
    mp.pathElements <== pathElements;
    mp.pathIndices <== leafIndex;
    mp.root === rootPool;

    // (c) nullifier of C1 (single-release)
    component nf = Nullifier();
    nf.nk         <== nk;
    nf.commitment <== cin.out;
    nf.leafIndex  <== leafIndex;
    nullifierOut  <== nf.out;

    // (c') repaid: repaid_leaf(lock_handle(lockId)) in rootRepaid
    component lh = DomainHash1();
    lh.x <== lockId;
    lh.domainSep <== 49; // DS_LOCK
    component rl = DomainHash1();
    rl.x <== lh.out;
    rl.domainSep <== 50; // DS_REPAID
    component mpr = MerkleProof(levels);
    mpr.leaf <== rl.out;
    mpr.pathElements <== repaidPathElements;
    mpr.pathIndices <== repaidLeafIndex;
    mpr.root === rootRepaid;

    // (d) binding: lockId = Poseidon2(C0, r) — the solvency link C1 <-> C0
    component bind = Poseidon2(2);
    bind.inputs[0] <== C0;
    bind.inputs[1] <== r;
    bind.domainSeparation <== 53; // DS_LOCKBIND = 0x35
    lockId === bind.out;

    // (e) bind recipient into the constraint system (anti-redirect)
    signal recipientSq;
    recipientSq <== recipient * recipient;
}
```

- [ ] **Step 2: Write the test wrapper `release_repaid_test.circom`**

```circom
pragma circom 2.2.2;
include "release_repaid.circom";
component main {public [C0, recipient, rootPool, rootRepaid]} = ReleaseRepaid(16);
```

- [ ] **Step 3: Compile**

```bash
cd circom && circom release_repaid_test.circom --r1cs --wasm --sym -o .
```

Expected: `release_repaid_test.r1cs` (size on the order of `unlock_test.r1cs` ≈ 2.5 MB), `release_repaid_test_js/release_repaid_test.wasm`, no errors.

- [ ] **Step 4: Build the canonical witness `release_repaid_input.json`**

The valid witness reuses the same `amount/spendPk/nk/lockId/r` as the LOCKED note in `lock_input.json` (so `C0` and the binding agree), plus a repaid-tree membership. Add a generator to `web/scripts/gen-lock-fixture.ts` OR create `web/scripts/gen-release-fixture.ts`:

```ts
// Build circom/release_repaid_input.json from the lock fixture + a repaid-tree membership.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { poseidon2Hash2 } from "@/lib/prove/poseidon2";
import { noteCommitment, domainHash1 } from "@/lib/prove/notes";
import { buildTree, merklePath } from "@/lib/prove/tree";
import { keccak256, toBytes } from "viem";

const DS_NOTE_LOCKED = 0x11n, DS_LOCK = 0x31n, DS_REPAID = 0x32n;
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const lock = JSON.parse(readFileSync(resolve(__dirname, "../../circom/lock_input.json"), "utf8"));
const amount = BigInt(lock.amount), spendPk = BigInt(lock.spendPk);
const nk = BigInt(lock.nk), lockId = BigInt(lock.lockId), r = BigInt(lock.r);
const blindingOut = BigInt(lock.blindingOut); // the LOCKED note blinding
const c0 = BigInt(lock.commitmentAvailable ?? lock.C0 ?? "0"); // fall back below if absent

// C1 = LOCKED note commitment
const c1 = noteCommitment(DS_NOTE_LOCKED, amount, spendPk, blindingOut, lockId);
// pool tree with C1 as the single leaf at index 0
const pool = buildTree([c1]);
const poolPath = merklePath(pool, 0);
// repaid tree: leaf = repaid_leaf(lock_handle(lockId))
const repaidLeaf = domainHash1(domainHash1(lockId, DS_LOCK), DS_REPAID);
const repaid = buildTree([repaidLeaf]);
const repaidPath = merklePath(repaid, 0);
// recipient = keccak(evm addr) mod r
const evm = "0xe9179cEf0000000000000000000000000000dead"; // 20-byte test recipient
const recipient = BigInt(keccak256(toBytes(evm))) % BN254_R;

const out = {
  C0: c0.toString(), recipient: recipient.toString(),
  rootPool: poolPath.root.toString(), rootRepaid: repaidPath.root.toString(),
  amount: amount.toString(), blindingIn: blindingOut.toString(),
  spendPk: spendPk.toString(), nk: nk.toString(),
  lockId: lockId.toString(), r: r.toString(),
  leafIndex: "0", pathElements: poolPath.pathElements.map(String),
  repaidLeafIndex: "0", repaidPathElements: repaidPath.pathElements.map(String),
};
writeFileSync(resolve(__dirname, "../../circom/release_repaid_input.json"), JSON.stringify(out, null, 2) + "\n");
```

> Confirm the exact exported names in `web/lib/prove/notes.ts` (`noteCommitment`, `domainHash1`) and `web/lib/prove/tree.ts` (tree build + path helpers) before running; use the real names. If `lock_input.json` lacks `commitmentAvailable`, compute `c0 = noteCommitment(0x10n, amount, spendPk, BigInt(lock.blindingIn), 0n)` (it must equal the value used for `lockId` in Task 1).

Run:

```bash
cd web && pnpm tsx scripts/gen-release-fixture.ts
```

Expected: `circom/release_repaid_input.json` written with 5 public + all private fields.

- [ ] **Step 5: Add `release_repaid` to the ceremony + fixtures generator**

In `circom/ceremony.sh`, add `release_repaid` to the circuit loop list (alongside `borrow lock unlock seize deposit_from_eth`). In `circom/gen_fixtures.js`, add `"release_repaid"` to the `circuits` array.

Run the ceremony (produces the proving key + VK):

```bash
cd circom && bash ceremony.sh
```

Expected: `circom/release_repaid.zkey` and `circom/keys/release_repaid.vk.json` produced.

- [ ] **Step 6: Prove/verify the valid witness**

```bash
cd circom
node release_repaid_test_js/generate_witness.js release_repaid_test_js/release_repaid_test.wasm release_repaid_input.json /tmp/rr.wtns
snarkjs groth16 prove release_repaid.zkey /tmp/rr.wtns /tmp/rr_proof.json /tmp/rr_public.json
snarkjs groth16 verify keys/release_repaid.vk.json /tmp/rr_public.json /tmp/rr_proof.json
cat /tmp/rr_public.json
```

Expected: `[INFO] snarkJS: OK!`; `/tmp/rr_public.json` is a 5-element array `[nullifierOut, C0, recipient, rootPool, rootRepaid]`.

- [ ] **Step 7: Insolvency-attack test (§2.5) — MUST fail**

Build the attack witness: a repaid LOCKED note of the SAME amount but bound to a DIFFERENT `C0_b` (i.e. reveal `C0_b` while the repaid note's `lockId = Poseidon2(C0_a, r_a)`). Create `circom/release_repaid_attack_input.json` by copying `release_repaid_input.json` and replacing only `C0` with an unrelated canonical field element (so `lockId !== Poseidon2(C0, r)`):

```bash
cd circom
node -e "const j=require('./release_repaid_input.json'); j.C0=(BigInt(j.C0)+12345n).toString(); require('fs').writeFileSync('release_repaid_attack_input.json',JSON.stringify(j,null,2))"
node release_repaid_test_js/generate_witness.js release_repaid_test_js/release_repaid_test.wasm release_repaid_attack_input.json /tmp/rr_atk.wtns; echo "exit=$?"
```

Expected: witness generation ABORTS on the `lockId === bind.out` constraint (`Assert Failed`), `exit` non-zero. This proves active-loan collateral cannot be released via a repaid same-amount note.

- [ ] **Step 8: Commit**

```bash
git add circom/release_repaid.circom circom/release_repaid_test.circom circom/release_repaid_input.json circom/release_repaid_attack_input.json circom/ceremony.sh circom/gen_fixtures.js circom/release_repaid.zkey circom/keys/release_repaid.vk.json web/scripts/gen-release-fixture.ts
git commit -m "feat(circom): release_repaid reverse-leg circuit + insolvency-attack fixture"
```

---

## Task 3: Deploy new Soroban Groth16 verifiers (lock v2 + release_repaid)

**Files:**
- Modify: `contracts/veil-verifier/src/fixtures.rs` (regenerated via `gen_fixtures.js` from Task 2)
- Output: two deployed verifier contract IDs recorded in `DEPLOYMENTS.md`

**Interfaces:**
- Consumes: `circom/keys/lock.vk.json` (Task 1), `circom/keys/release_repaid.vk.json` (Task 2).
- Produces: `<LOCK_V2_VERIFIER_ID>` and `<RELEASE_VERIFIER_ID>` (Soroban testnet contract addresses). Consumed by Task 6 (pool constructor).

- [ ] **Step 1: Regenerate verifier fixtures**

```bash
cd circom && node gen_fixtures.js
```

Expected: `contracts/veil-verifier/src/fixtures.rs` regenerated including `lock` (new VK) and `release_repaid`.

- [ ] **Step 2: Run the verifier crate's unit tests against both VKs**

The verifier bakes its VK from `VERIFIER_VK_JSON`. Confirm the release VK verifies its fixture proof:

```bash
cd contracts/veil-verifier
VERIFIER_VK_JSON=../../circom/keys/release_repaid.vk.json cargo test --release
VERIFIER_VK_JSON=../../circom/keys/lock.vk.json cargo test --release
```

Expected: tests pass (pairing check accepts the embedded fixture proof, rejects a tampered one).

- [ ] **Step 3: Build the two verifier WASMs**

```bash
cd contracts/veil-verifier
VERIFIER_VK_JSON=../../circom/keys/lock.vk.json cargo build --release --target wasm32v1-none
cp ../../target/wasm32v1-none/release/veil_verifier.wasm /tmp/lock_v2_verifier.wasm
VERIFIER_VK_JSON=../../circom/keys/release_repaid.vk.json cargo build --release --target wasm32v1-none
cp ../../target/wasm32v1-none/release/veil_verifier.wasm /tmp/release_verifier.wasm
```

Expected: two distinct WASMs (~13 KB each, different sha256).

- [ ] **Step 4: Deploy both to testnet**

```bash
export SOROBAN_SOURCE=veil-spike   # existing funded identity per DEPLOYMENTS.md
stellar contract deploy --wasm /tmp/lock_v2_verifier.wasm --source "$SOROBAN_SOURCE" --network testnet
stellar contract deploy --wasm /tmp/release_verifier.wasm --source "$SOROBAN_SOURCE" --network testnet
```

Expected: two contract IDs printed. Record as `<LOCK_V2_VERIFIER_ID>` and `<RELEASE_VERIFIER_ID>`.

- [ ] **Step 5: Record + commit**

Append both IDs to `DEPLOYMENTS.md` under a new "Reverse-leg verifiers (2026-07-03)" section.

```bash
git add contracts/veil-verifier/src/fixtures.rs DEPLOYMENTS.md
git commit -m "chore(verifier): deploy lock-v2 + release_repaid Groth16 verifiers"
```

---

## Task 4: `veil-pool` — Axelar outbound client, config, and setters

**Files:**
- Modify: `contracts/veil-pool/src/lib.rs`
- Test: `contracts/veil-pool/src/lib.rs` (inline `#[cfg(test)]` mod, following the crate's existing test style)

**Interfaces:**
- Produces: `AxelarGatewayMessagingClient::call_contract(caller, dest_chain, dest_addr, payload)`, `AxelarGasServiceClient::pay_gas(sender, dest_chain, dest_addr, payload, spender, token, metadata)`, `Token { address, amount }`, `ConfigKey::{ReleaseVerifier, AxelarGasService, GasToken, GasBudget}`, `set_axelar_outbound(gas_service, gas_token, gas_budget)`, `__constructor(..., release_verifier)`, `BN254_R`. Consumed by Task 5 (entrypoint), Task 6 (deploy/config).

- [ ] **Step 1: Add the outbound client traits + `Token` type**

Alongside the existing `AxelarGatewayIface` (`lib.rs:137-148`), add:

```rust
use soroban_sdk::{contracttype, Bytes};

/// Token used to pay Axelar gas (address + amount) — mirrors stellar_axelar_std::types::Token.
#[contracttype]
#[derive(Clone)]
pub struct Token {
    pub address: Address,
    pub amount: i128,
}

/// Outbound GMP send. Hand-written ABI-level client (no axelar crate — protocol-level ScVal args).
#[contractclient(name = "AxelarGatewayMessagingClient")]
pub trait AxelarGatewayMessagingIface {
    fn call_contract(
        env: Env, caller: Address, destination_chain: String,
        destination_address: String, payload: Bytes,
    );
}

/// Gas prepayment for an outbound call. Hand-written ABI-level client.
#[contractclient(name = "AxelarGasServiceClient")]
pub trait AxelarGasServiceIface {
    fn pay_gas(
        env: Env, sender: Address, destination_chain: String, destination_address: String,
        payload: Bytes, spender: Address, token: Token, metadata: Bytes,
    );
}
```

- [ ] **Step 2: Extend `ConfigKey` + add `BN254_R`**

In the `ConfigKey` enum (`lib.rs:74-97`) add four variants:

```rust
    ReleaseVerifier,    // Groth16 verifier for the release_repaid circuit.
    AxelarGasService,   // Axelar gas service (pay_gas) for the outbound reverse leg.
    GasToken,           // SAC used to prepay outbound Axelar gas (testnet: native XLM SAC).
    GasBudget,          // i128 gas amount prepaid per release (calibrated on testnet).
```

Near the top of `lib.rs`, add the field modulus (copied verbatim from `veil-vault`):

```rust
/// BN254 scalar field modulus `r` (big-endian) — recipient binding is reduced mod r.
const BN254_R: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];
const DEFAULT_GAS_BUDGET: i128 = 20_000_000; // 2 XLM (7 dp) — recalibrated in Task 8.
```

- [ ] **Step 3: Add `release_verifier` to `__constructor` + the one-time setter**

In `__constructor` (`lib.rs:182-209`), add a `release_verifier: Address` parameter and set it:

```rust
        env.storage().instance().set(&ConfigKey::ReleaseVerifier, &release_verifier);
```

Add a one-time setter mirroring `set_eth_lock` (`lib.rs:216-226`):

```rust
/// One-time: wire the Axelar gas service + gas token + per-release gas budget for the reverse leg.
pub fn set_axelar_outbound(env: Env, gas_service: Address, gas_token: Address, gas_budget: i128) {
    let admin: Address = env.storage().instance().get(&ConfigKey::Admin).expect("not initialized");
    admin.require_auth();
    assert!(!env.storage().instance().has(&ConfigKey::AxelarGasService), "outbound already set");
    assert!(gas_budget > 0, "gas budget must be positive");
    let s = env.storage().instance();
    s.set(&ConfigKey::AxelarGasService, &gas_service);
    s.set(&ConfigKey::GasToken, &gas_token);
    s.set(&ConfigKey::GasBudget, &gas_budget);
    s.extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
}
```

- [ ] **Step 3b: Add a mutable `set_gas_budget` (calibration escape hatch)**

`GasBudget` is set once by `set_axelar_outbound`, but the live gas amount must be tunable post-deploy without a pool redeploy (Task 8 calibration). Add an admin-only mutable setter:

```rust
/// Admin-only: retune the per-release Axelar gas budget after live calibration.
pub fn set_gas_budget(env: Env, gas_budget: i128) {
    let admin: Address = env.storage().instance().get(&ConfigKey::Admin).expect("not initialized");
    admin.require_auth();
    assert!(gas_budget > 0, "gas budget must be positive");
    env.storage().instance().set(&ConfigKey::GasBudget, &gas_budget);
    env.storage().instance().extend_ttl(ttl::BUMP_THRESHOLD, ttl::BUMP_AMOUNT);
}
```

- [ ] **Step 4: Write a unit test for `set_axelar_outbound` idempotency**

Add to the pool's test module (follow the existing `#[cfg(test)]` harness — `Env::default()`, register the contract, admin auth via `env.mock_all_auths()`):

```rust
#[test]
#[should_panic(expected = "outbound already set")]
fn set_axelar_outbound_is_one_time() {
    let (env, client, _admin, gas) = setup_pool(); // existing-style helper that deploys + returns admin
    env.mock_all_auths();
    client.set_axelar_outbound(&gas.clone(), &gas.clone(), &1i128);
    client.set_axelar_outbound(&gas.clone(), &gas.clone(), &1i128); // panics
}
```

> Use the crate's existing pool-setup test helper (grep the test module for how `lock`/`unlock` tests instantiate the pool + admin); do not invent a new fixture shape.

- [ ] **Step 5: Build + run tests**

```bash
cd contracts/veil-pool && cargo test --release
```

Expected: all existing tests still pass; `set_axelar_outbound_is_one_time` passes.

- [ ] **Step 6: Commit**

```bash
git add contracts/veil-pool/src/lib.rs
git commit -m "feat(pool): Axelar outbound client traits + reverse-leg config + setter"
```

---

## Task 5: `veil-pool` — `release_repaid` entrypoint

**Files:**
- Modify: `contracts/veil-pool/src/lib.rs`

**Interfaces:**
- Consumes: Task 4's traits/config; `Self::{require_canonical, fr, verify, known_root, vault}`, `NullifierSet::try_spend` (existing).
- Produces: `release_repaid(proof, nullifier, c0, recipient: BytesN<20>, root_pool, root_repaid)` + `recipient_field` + `emit_release` + `ReleaseEmitted` event. Consumed by Task 11 (web invoke), Task 15 (e2e).

- [ ] **Step 1: Add the `ReleaseEmitted` event**

Alongside the existing events (e.g. near `AttestLock`):

```rust
#[contractevent]
pub struct ReleaseEmitted {
    pub c0: U256,
    pub recipient: BytesN<20>,
}
```

> Match the crate's actual event pattern (the inbound leg uses `AttestLock { ... }.publish(&env)` — confirm whether it's `#[contractevent]` or a manual `env.events().publish`; mirror it exactly).

- [ ] **Step 2: Add `recipient_field` helper**

```rust
/// keccak256(evm_addr) mod r — the recipient binding the release proof commits to
/// (mirrors veil-vault's borrower_field; the payload carries the RAW address for the transfer).
fn recipient_field(env: &Env, addr: &BytesN<20>) -> U256 {
    let h = env.crypto().keccak256(&Bytes::from_array(env, &addr.to_array())).to_bytes();
    let hu = U256::from_be_bytes(env, &Bytes::from_array(env, &h.to_array()));
    let r = U256::from_be_bytes(env, &Bytes::from_array(env, &BN254_R));
    hu.rem_euclid(&r)
}
```

- [ ] **Step 3: Add `emit_release` helper (pay_gas + call_contract, same tx)**

```rust
/// Emit the reverse-leg Axelar message: pay gas, then call VeilEthLock on Sepolia.
/// Destination reuses the trusted inbound counterpart (SourceChain = Ethereum's Axelar name,
/// EthLockAddr = the VeilEthLock string). A trap here reverts the caller's nullifier spend.
fn emit_release(env: &Env, c0: &U256, recipient: &BytesN<20>) {
    let s = env.storage().instance();
    let gateway: Address = s.get(&ConfigKey::AxelarGateway).expect("gateway unset");
    let gas_service: Address = s.get(&ConfigKey::AxelarGasService).expect("gas service unset");
    let gas_token: Address = s.get(&ConfigKey::GasToken).expect("gas token unset");
    let dest_chain: String = s.get(&ConfigKey::SourceChain).expect("dest chain unset");
    let dest_addr: String = s.get(&ConfigKey::EthLockAddr).expect("dest addr unset");
    let budget: i128 = s.get(&ConfigKey::GasBudget).expect("gas budget unset");

    // payload = abi.encode(uint256 C0, address recipient) -> 64 bytes
    let mut payload = Bytes::new(env);
    payload.append(&c0.to_be_bytes());                                   // 32 bytes
    payload.extend_from_array(&[0u8; 12]);                               // address left-pad
    payload.append(&Bytes::from_array(env, &recipient.to_array()));      // 20 bytes

    let me = env.current_contract_address();

    // Prepay gas from the pool's own gas-token balance. The gas service pulls the token from
    // `sender`, so authorize that transfer as the current contract (calibrated in Task 8).
    env.authorize_as_current_contract(soroban_sdk::vec![
        env,
        soroban_sdk::auth::InvokerContractAuthEntry::Contract(soroban_sdk::auth::SubContractInvocation {
            context: soroban_sdk::auth::ContractContext {
                contract: gas_token.clone(),
                fn_name: soroban_sdk::Symbol::new(env, "transfer"),
                args: (me.clone(), gas_service.clone(), budget).into_val(env),
            },
            sub_invocations: soroban_sdk::vec![env],
        }),
    ]);
    AxelarGasServiceClient::new(env, &gas_service).pay_gas(
        &me, &dest_chain, &dest_addr, &payload, &me,
        &Token { address: gas_token, amount: budget }, &Bytes::new(env),
    );

    // Send the GMP message. The pool is the DIRECT caller, so call_contract's
    // caller.require_auth() is auto-satisfied (no authorize_as_current_contract needed).
    AxelarGatewayMessagingClient::new(env, &gateway)
        .call_contract(&me, &dest_chain, &dest_addr, &payload);

    ReleaseEmitted { c0: c0.clone(), recipient: recipient.clone() }.publish(env);
}
```

> The `authorize_as_current_contract` transfer args `(me, gas_service, budget)` assume the gas service pulls the token directly to itself; the EXACT collector/args are calibrated on testnet in Task 8 (spec §5.4). If the deployed gas service reverts, adjust the sub-invocation context to match its real `transfer` signature — this is the one runtime-empirical value the spec sanctions. `pay_gas` is a convenience for auto-execution; `call_contract` alone provides atomicity, and Axelarscan manual re-execution is the documented fallback.

- [ ] **Step 4: Add the `release_repaid` entrypoint**

```rust
/// Reverse leg: verify a repaid-release proof, spend the LOCKED note's nullifier, and emit an
/// Axelar message releasing the C0-keyed WETH on Sepolia to `recipient`.
pub fn release_repaid(
    env: Env,
    proof: Groth16Proof,
    nullifier: U256,
    c0: U256,
    recipient: BytesN<20>,
    root_pool: U256,
    root_repaid: U256,
) {
    for v in [&nullifier, &c0, &root_pool, &root_repaid] {
        Self::require_canonical(&env, v);
    }
    let recipient_fr = Self::recipient_field(&env, &recipient);

    // Public signals (snarkjs order): [nullifierOut, C0, recipient, rootPool, rootRepaid].
    let mut pi: Vec<Bn254Fr> = Vec::new(&env);
    pi.push_back(Self::fr(&env, &nullifier));
    pi.push_back(Self::fr(&env, &c0));
    pi.push_back(Self::fr(&env, &recipient_fr));
    pi.push_back(Self::fr(&env, &root_pool));
    pi.push_back(Self::fr(&env, &root_repaid));
    Self::verify(&env, ConfigKey::ReleaseVerifier, &proof, &pi);

    assert!(Self::known_root(&env, &root_pool), "unknown pool root");
    assert!(root_repaid == Self::vault(&env).repaid_root(), "unknown/stale repaid root");
    assert!(NullifierSet::try_spend(&env, &nullifier), "nullifier already spent");

    // No new pool leaf is minted (collateral leaves the shielded pool for Ethereum).
    // TotalDeposited is a high-water informational counter and is intentionally NOT decremented
    // here (the release circuit does not expose amount); the real double-release guards are
    // try_spend(nullifier) above + released[C0] on Ethereum.
    Self::emit_release(&env, &c0, &recipient);
}
```

- [ ] **Step 5: Unit test — nullifier double-spend is rejected**

Add a test that submits a valid release twice (mock the verifier + gateway clients, or use the fixture proof from Task 3) and asserts the second `try_spend` panics with `nullifier already spent`. Reuse the fixtures embedded via `gen_fixtures.js`.

```rust
#[test]
#[should_panic(expected = "nullifier already spent")]
fn release_repaid_single_release() {
    // build pool with ReleaseVerifier = a mock that accepts; call release_repaid twice with the
    // same nullifier; second call panics. (Mirror the existing unlock double-spend test shape.)
    ...
}
```

> Model this on the existing `unlock`/`lock` double-spend tests in the crate — reuse their mock-verifier + mock-gateway helpers. If the crate has no mock gateway for outbound, gate the emit behind a test-only no-op or register a minimal mock implementing `call_contract`/`pay_gas`.

- [ ] **Step 6: Build + test**

```bash
cd contracts/veil-pool && cargo build --release --target wasm32v1-none && cargo test --release
```

Expected: WASM builds; all tests (existing + new) pass.

- [ ] **Step 7: Commit**

```bash
git add contracts/veil-pool/src/lib.rs
git commit -m "feat(pool): release_repaid entrypoint (verify, spend, outbound Axelar)"
```

---

## Task 6: Redeploy `veil-pool` + wire config

**Files:**
- Output: `<POOL_V2_ID>` recorded in `DEPLOYMENTS.md`

**Interfaces:**
- Consumes: `<LOCK_V2_VERIFIER_ID>`, `<RELEASE_VERIFIER_ID>` (Task 3), the vault address, Axelar gateway + gas service + gas token, `SourceChain`, `EthLockAddr`.
- Produces: `<POOL_V2_ID>`. Consumed by Task 8 (VeilEthLock cross-pin), Task 11 (web addresses), Task 15 (e2e).

- [ ] **Step 1: Re-verify the live Axelar identifiers**

Query `getChains` (Axelar testnet) to confirm the current Stellar Amplifier chain name (expect `stellar-2026-q1-2`) and the Ethereum Sepolia Axelar chain name (used as `source_chain` / outbound `dest_chain`). Confirm the Stellar gateway + gas service addresses. Do NOT hardcode a stale name.

Expected: current chain names + gateway/gas-service addresses recorded.

- [ ] **Step 2: Build + deploy the new pool**

```bash
cd contracts/veil-pool && stellar contract build
WASM="$(ls ../../target/wasm32v1-none/release/veil_pool.wasm | head -1)"
stellar contract deploy --wasm "$WASM" --source veil-spike --network testnet
```

Record `<POOL_V2_ID>`.

- [ ] **Step 3: Initialize via `__constructor`**

Invoke the constructor with: admin, token (USDC SAC / collateral token), the three joinsplit verifiers (LockVerifier = `<LOCK_V2_VERIFIER_ID>`, UnlockVerifier + SeizeVerifier = the EXISTING deployed unlock/seize verifiers — reused unchanged), `release_verifier = <RELEASE_VERIFIER_ID>`, Axelar gateway, and `source_chain` (Ethereum Sepolia's Axelar name). Use the exact constructor arg order from `lib.rs:182-209`.

```bash
stellar contract invoke --id <POOL_V2_ID> --source veil-spike --network testnet -- __constructor \
  --admin <ADMIN> --token <USDC_SAC> --lock_verifier <LOCK_V2_VERIFIER_ID> \
  --unlock_verifier <UNLOCK_VERIFIER_ID> --seize_verifier <SEIZE_VERIFIER_ID> \
  --release_verifier <RELEASE_VERIFIER_ID> --axelar_gateway <STELLAR_GATEWAY> \
  --source_chain <ETH_SEPOLIA_AXELAR_NAME>
```

> If the pool constructor is invoked at deploy-time (`--constructor`-style) rather than as a callable method, adapt to the crate's actual constructor invocation convention (check how the live pool was constructed in `DEPLOYMENTS.md`).

- [ ] **Step 4: Wire vault + outbound config**

```bash
stellar contract invoke --id <POOL_V2_ID> --source veil-spike --network testnet -- set_vault --vault <VAULT_ID>
stellar contract invoke --id <POOL_V2_ID> --source veil-spike --network testnet -- \
  set_axelar_outbound --gas_service <STELLAR_GAS_SERVICE> --gas_token <NATIVE_XLM_SAC> --gas_budget 20000000
```

(`set_eth_lock` is deferred to Task 8, after VeilEthLock v2 is deployed.)

- [ ] **Step 5: Fund the pool's gas-token balance**

Transfer the gas budget (e.g. 5 XLM) of the native-XLM SAC to `<POOL_V2_ID>` so `pay_gas` can pull it.

- [ ] **Step 6: Record + commit**

Append the pool + config to `DEPLOYMENTS.md`.

```bash
git add DEPLOYMENTS.md
git commit -m "chore(pool): deploy + wire veil-pool v2 (reverse leg)"
```

---

## Task 7: `VeilEthLock` v2 Solidity — lock + Axelar `execute` release + Foundry tests

**Files:**
- Create: `contracts/escrow/src/VeilEthLockV2.sol`
- Create: `contracts/escrow/test/VeilEthLockV2.t.sol`

**Interfaces:**
- Produces: `VeilEthLockV2` with `lock(amount, C, pA, pB, pC) payable`, `execute(commandId, sourceChain, sourceAddress, payload)`, `isReleased(uint256 C) view`, `released` mapping, `Released` event, `setTrustedSource(chain, addr)` one-time. Consumed by Task 8 (deploy), Task 11 (web `isReleased`).

- [ ] **Step 1: Write `VeilEthLockV2.sol`**

Copy `VeilEthLock.sol` and extend: keep `lock(...)` + `setDestination(...)` verbatim; extend `IAxelarGateway` with `validateContractCall`; add the trusted-Stellar-source pins, `released` mapping, `execute`, `isReleased`. New/changed parts:

```solidity
interface IAxelarGateway {
    function callContract(string calldata destinationChain, string calldata contractAddress, bytes calldata payload) external;
    function validateContractCall(bytes32 commandId, string calldata sourceChain, string calldata sourceAddress, bytes32 payloadHash) external returns (bool);
}

// --- reverse-leg state ---
string public trustedSourceChain;    // e.g. "stellar-2026-q1-2" (set once)
string public trustedSourceAddress;  // the veil-pool strkey (set once)
mapping(uint256 => bool) public released; // C => released (double-release guard)

event Released(uint256 indexed commitment, address indexed recipient, uint256 amount);
error SourceAlreadySet();
error NotApprovedByGateway();
error UntrustedSource();
error AlreadyReleased();
error NothingLocked();

function setTrustedSource(string calldata chain_, string calldata addr_) external {
    if (msg.sender != owner) revert NotOwner();
    if (bytes(trustedSourceAddress).length != 0) revert SourceAlreadySet();
    trustedSourceChain = chain_;
    trustedSourceAddress = addr_;
}

/// Axelar-executable entry: release the C-keyed WETH to `recipient` after a Stellar repay.
function execute(
    bytes32 commandId,
    string calldata sourceChain,
    string calldata sourceAddress,
    bytes calldata payload
) external {
    bytes32 payloadHash = keccak256(payload);
    if (!gateway.validateContractCall(commandId, sourceChain, sourceAddress, payloadHash))
        revert NotApprovedByGateway();
    if (keccak256(bytes(sourceChain)) != keccak256(bytes(trustedSourceChain))
        || keccak256(bytes(sourceAddress)) != keccak256(bytes(trustedSourceAddress)))
        revert UntrustedSource();

    (uint256 C, address recipient) = abi.decode(payload, (uint256, address));
    if (released[C]) revert AlreadyReleased();
    Lock memory l = locks[C];
    if (l.amount == 0) revert NothingLocked();

    released[C] = true;                 // effects before interaction
    totalLocked -= l.amount;
    if (!weth.transfer(recipient, l.amount)) revert WethTransferFailed();
    emit Released(C, recipient, l.amount);
}

function isReleased(uint256 C) external view returns (bool) { return released[C]; }
```

> `validateContractCall` is the classic (pre-Amplifier) Axelar EVM gateway method that both checks approval and flips it to executed (replay guard). Confirm the Sepolia gateway `0xe432150cce91c13a887f7D836923d5597adD8E31` exposes it (it is the standard AxelarGateway) — if the deployment uses the newer `AxelarAmplifierGateway`, use its `validateMessage(...)` equivalent instead. The double guard (`released[C]` + gateway replay) holds either way.

- [ ] **Step 2: Write the Foundry test with a mock gateway that approves**

Create `contracts/escrow/test/VeilEthLockV2.t.sol`, extending the existing mocks (`MockWstETH`, `MockAxelarGateway`, `MockAxelarGasService`) with a settable `validateContractCall`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import {VeilEthLockV2} from "../src/VeilEthLockV2.sol";
import {MockWstETH} from "../src/MockWstETH.sol";

contract MockGatewayV2 {
    bool public approve = true;
    function setApprove(bool a) external { approve = a; }
    function callContract(string calldata, string calldata, bytes calldata) external {}
    function validateContractCall(bytes32, string calldata, string calldata, bytes32) external view returns (bool) { return approve; }
}
contract MockGas { function payNativeGasForContractCall(address,string calldata,string calldata,bytes calldata,address) external payable {} }

contract VeilEthLockV2Test is Test {
    VeilEthLockV2 lockc; MockWstETH weth; MockGatewayV2 gw; MockGas gas;
    address user = address(0xBEEF);
    address recipient = address(0xD00D);
    uint256 constant C = 0x01c209ef00000000000000000000000000000000000000000000000000000001;
    uint256 constant AMOUNT = 2e18;
    string constant SRC_CHAIN = "stellar-2026-q1-2";
    string constant SRC_ADDR = "CDIHDUDQIODLZOJAOCZA7DFIHYSX4C37N42RRFWQRC6NN6P7V6263WTB";

    function setUp() public {
        weth = new MockWstETH(); gw = new MockGatewayV2(); gas = new MockGas();
        // deploy with the real DepositFromEthVerifier (for lock) — reuse the v1 test's deploy pattern.
        lockc = new VeilEthLockV2(address(weth), address(depositVerifier()), address(gw), address(gas));
        lockc.setTrustedSource(SRC_CHAIN, SRC_ADDR);
        // seed an escrow for C directly (bypass lock's proof gate by using the test helper below).
        weth.mint(address(lockc), AMOUNT);
        seedLock(C, AMOUNT, user); // see note
    }

    function test_execute_releasesToRecipient() public {
        bytes memory payload = abi.encode(C, recipient);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
        assertEq(weth.balanceOf(recipient), AMOUNT);
        assertTrue(lockc.isReleased(C));
    }
    function test_execute_rejectsDoubleRelease() public {
        bytes memory payload = abi.encode(C, recipient);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
        vm.expectRevert(VeilEthLockV2.AlreadyReleased.selector);
        lockc.execute(bytes32(uint256(2)), SRC_CHAIN, SRC_ADDR, payload);
    }
    function test_execute_rejectsUntrustedSourceAddress() public {
        bytes memory payload = abi.encode(C, recipient);
        vm.expectRevert(VeilEthLockV2.UntrustedSource.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, "CBADSOURCE", payload);
    }
    function test_execute_rejectsWhenGatewayNotApproved() public {
        gw.setApprove(false);
        bytes memory payload = abi.encode(C, recipient);
        vm.expectRevert(VeilEthLockV2.NotApprovedByGateway.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
    }
    function test_execute_rejectsUnknownCommitment() public {
        bytes memory payload = abi.encode(uint256(0xDEAD), recipient);
        vm.expectRevert(VeilEthLockV2.NothingLocked.selector);
        lockc.execute(bytes32(uint256(1)), SRC_CHAIN, SRC_ADDR, payload);
    }
}
```

> `seedLock`/`depositVerifier`: to test `execute` in isolation without a real lock proof, either (a) add a test-only path that calls the real `lock` with the v1 test's hardcoded proof fixture (reuse `pA()/pB()/pC()`, `C = 0x01c209ef…`, `AMOUNT = 2e18` from `VeilEthLock.t.sol`) so `locks[C]` is genuinely populated, or (b) expose a minimal internal test hook. Prefer (a) — reuse the proven fixture so the lock→release round trip is covered. Copy the `DepositFromEthVerifier` deploy + proof accessors from `VeilEthLock.t.sol` lines 53-95.

- [ ] **Step 3: Build + test**

```bash
cd contracts/escrow && forge build && forge test --match-contract VeilEthLockV2Test -vvv
```

Expected: all five `execute` tests pass; `forge build` clean.

- [ ] **Step 4: Commit**

```bash
git add contracts/escrow/src/VeilEthLockV2.sol contracts/escrow/test/VeilEthLockV2.t.sol
git commit -m "feat(escrow): VeilEthLock v2 with Axelar execute release + tests"
```

---

## Task 8: Deploy `VeilEthLock` v2 to Sepolia, cross-pin, fund, calibrate gas

**Files:**
- Create: `contracts/escrow/script/DeployEthLockV2.s.sol`
- Output: `<VEIL_ETH_LOCK_V2>` in `DEPLOYMENTS.md`

**Interfaces:**
- Consumes: `<POOL_V2_ID>` (Task 6), Sepolia WETH/gateway/gas-service constants.
- Produces: `<VEIL_ETH_LOCK_V2>`. Consumed by pool `set_eth_lock` (this task) + Task 11 (web) + Task 15 (e2e).

- [ ] **Step 1: Write the deploy script**

Copy `script/DeployEthLock.s.sol` → `DeployEthLockV2.s.sol`, deploying `DepositFromEthVerifier` (reuse) + `VeilEthLockV2` with the same Sepolia constants (`SEPOLIA_WETH`, `SEPOLIA_AXELAR_GATEWAY`, `SEPOLIA_AXELAR_GAS_SERVICE`). Leave `setDestination` + `setTrustedSource` as post-deploy calls.

- [ ] **Step 2: Deploy**

```bash
cd contracts/escrow
forge script script/DeployEthLockV2.s.sol:DeployEthLockV2 --rpc-url "$SEPOLIA_RPC_URL" --broadcast
```

Record `<VEIL_ETH_LOCK_V2>` (and the verifier if newly deployed) from `broadcast/DeployEthLockV2.s.sol/11155111/run-latest.json`.

- [ ] **Step 3: Cross-pin both directions**

- On Ethereum: `VeilEthLockV2.setDestination(<ETH_SEPOLIA?>...)` is not needed for release, but `setTrustedSource(<STELLAR_AMPLIFIER_CHAIN>, <POOL_V2_ID>)` IS — pin the Stellar chain name + pool strkey. Also `setDestination(<STELLAR_AMPLIFIER_CHAIN>, <POOL_V2_ID>)` so the forward `lock` on v2 targets the new pool.

```bash
cast send <VEIL_ETH_LOCK_V2> "setTrustedSource(string,string)" "<STELLAR_AMPLIFIER_CHAIN>" "<POOL_V2_ID>" --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
cast send <VEIL_ETH_LOCK_V2> "setDestination(string,string)" "<STELLAR_AMPLIFIER_CHAIN>" "<POOL_V2_ID>" --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

- On Stellar: pin the checksummed EVM address as the pool's trusted counterpart + outbound destination:

```bash
stellar contract invoke --id <POOL_V2_ID> --source veil-spike --network testnet -- set_eth_lock --eth_lock_addr <VEIL_ETH_LOCK_V2_CHECKSUMMED>
```

- [ ] **Step 4: Calibrate `pay_gas` on the live route (spec §5.4)**

Do a throwaway `release_repaid` on testnet with a dummy proof path OR observe the first real e2e (Task 15). If `pay_gas` reverts on the `authorize_as_current_contract` transfer, read the revert, adjust the sub-invocation context in `emit_release` (Task 5 Step 3) to the gas service's real `transfer` args, re-deploy the pool. If auto-execution under-funds, note the Axelarscan manual re-exec fallback. Record the working gas budget; if changed, re-run `set_axelar_outbound` is blocked (one-time) — so bake the calibrated `DEFAULT_GAS_BUDGET` before Task 6's deploy, or add a mutable admin `set_gas_budget` if calibration must happen post-deploy.

> Decision: to avoid the one-time-setter trap, make `GasBudget` mutable via a small admin-only `set_gas_budget(i128)` (add in Task 4) so calibration doesn't force a pool redeploy.

- [ ] **Step 5: Record + commit**

```bash
git add contracts/escrow/script/DeployEthLockV2.s.sol DEPLOYMENTS.md
git commit -m "chore(escrow): deploy + cross-pin VeilEthLock v2 on Sepolia"
```

---

## Task 9: Web — persist `r`, B1′-compatible note creation + lock witness, re-vendor lock

**Files:**
- Modify: `web/lib/app/notes.ts`, `web/lib/prove/lock.ts`, `web/scripts/vendor-circuits.sh`
- Test: `web/lib/app/notes.test.ts`, `web/lib/prove/lock.test.ts` (extend existing)

**Interfaces:**
- Consumes: `poseidon2Hash2` (`web/lib/prove/poseidon2.ts`), DS_LOCKBIND=0x35.
- Produces: `VeilNote.r: string`, `createNote` computing `lockId = Poseidon2(C0, r)`, `LockWitness.r`, `toReleaseNote`, statuses `repaid`/`released`. Consumed by Task 10 (release witness), Task 12 (pipeline).

- [ ] **Step 1: Add `r` to `LockNote`/`LockWitness` + validation in `lock.ts`**

In `web/lib/prove/lock.ts`: add `r: bigint` to `LockNote` (the private struct), `r: string` to `LockWitness`, add `["r", note.r]` to the canonical-field validation loop, and emit `r: note.r.toString()` in the returned witness object.

- [ ] **Step 2: Extend the lock witness test (RED)**

In `web/lib/prove/lock.test.ts`, add a case asserting the built witness includes a canonical `r` and rejects a non-canonical `r`:

```ts
it("includes r and rejects a non-canonical r", () => {
  const note = { ...validLockNote(), r: 5n };
  expect(buildLockWitness(note, validPath()).r).toBe("5");
  expect(() => buildLockWitness({ ...note, r: BN254_R }, validPath())).toThrow(/canonical/);
});
```

Run: `cd web && pnpm test -- lock` → Expected: the new assertions FAIL (no `r` yet) then PASS after Step 1. (If TDD order is preferred, write this before Step 1.)

- [ ] **Step 3: Add `r` + B1′ `lockId` to the note schema + `createNote`**

In `web/lib/app/notes.ts`: add `r: string;` to the `VeilNote` "opening secrets" block. In `createNote`, after `commitmentAvailable` is computed, draw `r = randomFieldElement()` and set `lockId = poseidon2Hash2(commitmentAvailable, r, 0x35n)` (REPLACING the previous random `lockId`), then compute `commitmentLocked` with that `lockId` as `aux`. Include `r` in the returned note. Add `repaid` and `released` to `NoteStatus`. Add a `toReleaseNote(note)` adapter (mirror `toLockNote`) exposing `amount, blindingOut, spendPk, nk, lockId, r` for the release witness.

```ts
// inside createNote, after commitmentAvailable:
const r = randomFieldElement();
const lockId = poseidon2Hash2(commitmentAvailable, r, 0x35n);
const commitmentLocked = noteCommitment(0x11n, amount, spendPk, blindingOut, lockId);
// ...return { ..., r: r.toString(), lockId: lockId.toString(), commitmentLocked: commitmentLocked.toString(), ... }
```

```ts
export type NoteStatus =
  | "created" | "locked-eth" | "attested" | "locked-note" | "borrowed" | "repaid" | "released";
```

- [ ] **Step 4: Note-creation test — lockId binding holds (RED→GREEN)**

In `web/lib/app/notes.test.ts`:

```ts
it("derives lockId = Poseidon2(C0, r) (B1' binding)", () => {
  const n = createNote(1000n);
  const expected = poseidon2Hash2(BigInt(n.commitmentAvailable), BigInt(n.r), 0x35n);
  expect(BigInt(n.lockId)).toBe(expected);
});
```

Run: `cd web && pnpm test -- notes` → Expected: PASS after Step 3.

- [ ] **Step 5: Re-vendor the lock circuit (new wasm/zkey/vk)**

```bash
cd web && bash scripts/vendor-circuits.sh
```

Expected: `web/public/circuits/lock/{lock.wasm,lock.zkey,lock.vk.json}` updated from the B1′ recompile.

- [ ] **Step 6: Re-run the live lock prover verify**

```bash
cd web && pnpm verify:lock-prover
```

Expected: builds witness (now with `r`), proves against the new vendored assets, offline verify OK, and — if the new lock verifier is wired — on-chain verify OK against `<LOCK_V2_VERIFIER_ID>` (update the hardcoded verifier address in `verify-lock-prover.ts` to the new one). Tamper test rejects.

- [ ] **Step 7: Full unit suite + commit**

```bash
cd web && pnpm test
```

Expected: 75 existing + new tests green.

```bash
git add web/lib/app/notes.ts web/lib/prove/lock.ts web/lib/app/notes.test.ts web/lib/prove/lock.test.ts web/scripts/vendor-circuits.sh web/public/circuits/lock web/scripts/verify-lock-prover.ts
git commit -m "feat(web): persist r, B1' lockId binding, re-vendor lock circuit"
```

---

## Task 10: Web — release prover, witness builder, vendor `release_repaid`, verify script

**Files:**
- Create: `web/lib/prove/release.ts`, `web/scripts/verify-release-prover.ts`
- Modify: `web/lib/prove/groth16.ts`, `web/scripts/vendor-circuits.sh`, `web/package.json`
- Test: `web/lib/prove/release.test.ts`

**Interfaces:**
- Consumes: `release_repaid` circuit + VK (Task 2), `toReleaseNote` (Task 9), `<RELEASE_VERIFIER_ID>` (Task 3).
- Produces: `buildReleaseWitness(note, poolPath, repaidPath, recipientField)`, `proveRelease(witness)`, `publicSignalsToReleaseArgs(sig)`. Consumed by Task 12 (pipeline).

- [ ] **Step 1: Add `buildReleaseWitness` in `web/lib/prove/release.ts`**

Mirror `buildLockWitness`: validate `TREE_DEPTH` on both paths, canonical-field-check every scalar, emit the decimal-string witness matching the circuit inputs `{ C0, recipient, rootPool, rootRepaid, amount, blindingIn, spendPk, nk, lockId, r, leafIndex, pathElements, repaidLeafIndex, repaidPathElements }`.

- [ ] **Step 2: Add the prover + decoder to `groth16.ts`**

```ts
const RELEASE_ASSETS: ProverAssets = {
  wasm: "/circuits/release_repaid/release_repaid.wasm",
  zkey: "/circuits/release_repaid/release_repaid.zkey",
};
export async function proveRelease(witness: ReleaseWitness, assets: ProverAssets = RELEASE_ASSETS): Promise<BorrowProof> {
  const snarkjs = await import("snarkjs");
  const input = witness as unknown as Record<string, string | string[]>;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, assets.wasm, assets.zkey);
  return { proof: proof as unknown as SnarkProof, publicSignals: publicSignals as string[] };
}
// public order: [nullifierOut, C0, recipient, rootPool, rootRepaid]
export function publicSignalsToReleaseArgs(sig: string[]) {
  if (sig.length !== 5) throw new Error(`release: expected 5 public signals, got ${sig.length}`);
  return { nullifier: BigInt(sig[0]), c0: BigInt(sig[1]), recipient: BigInt(sig[2]), rootPool: BigInt(sig[3]), rootRepaid: BigInt(sig[4]) };
}
```

- [ ] **Step 3: Vendor the circuit**

Add `vendor release_repaid` to `web/scripts/vendor-circuits.sh`, then:

```bash
cd web && bash scripts/vendor-circuits.sh
```

Expected: `web/public/circuits/release_repaid/{release_repaid.wasm,.zkey,.vk.json}` created. (The wasm source is `circom/release_repaid_test_js/release_repaid_test.wasm` → the vendor script's `${c}_test.wasm` path already matches.)

- [ ] **Step 4: Write + run the live release prover verify**

Copy `verify-lock-prover.ts` → `verify-release-prover.ts`: load `../../circom/release_repaid_input.json`, build via `buildReleaseWitness`, prove with the vendored release assets, assert 5 public signals in order, offline `snarkjs.groth16.verify` against `release_repaid.vk.json`, live `simulateTransaction` against `<RELEASE_VERIFIER_ID>`, tamper `publicSignals[0]` → rejection. Add `"verify:release-prover": "tsx scripts/verify-release-prover.ts"` to `package.json`.

```bash
cd web && pnpm verify:release-prover
```

Expected: offline verify OK, on-chain verify OK, tamper rejected.

- [ ] **Step 5: Unit test + commit**

Add `web/lib/prove/release.test.ts` asserting `buildReleaseWitness` emits all fields canonical and `publicSignalsToReleaseArgs` maps order correctly.

```bash
cd web && pnpm test -- release
git add web/lib/prove/release.ts web/lib/prove/release.test.ts web/lib/prove/groth16.ts web/scripts/vendor-circuits.sh web/scripts/verify-release-prover.ts web/package.json web/public/circuits/release_repaid
git commit -m "feat(web): release_repaid browser prover + witness + vendor + verify"
```

---

## Task 11: Web — Soroban release invoke, Ethereum release observation, addresses

**Files:**
- Modify: `web/lib/app/stellar.ts`, `web/lib/app/eth.ts`, `web/lib/onchain.ts`

**Interfaces:**
- Consumes: `<POOL_V2_ID>`, `<RELEASE_VERIFIER_ID>`, `<VEIL_ETH_LOCK_V2>` (Tasks 3/6/8).
- Produces: `releaseRepaid(proof, nullifier, c0, recipient, rootPool, rootRepaid, source)`, `isReleased(C)`. Consumed by Task 12 (pipeline).

- [ ] **Step 1: Update `onchain.ts`**

Replace `VEIL_POOL`, `VEIL_ETH_LOCK`, `VEIL_LOCK_VERIFIER` with the v2 addresses; add `VEIL_RELEASE_VERIFIER = "<RELEASE_VERIFIER_ID>"`. Keep the OLD constants only if any live view still needs them (they should not — the reverse e2e uses v2 end to end).

- [ ] **Step 2: Add the `releaseRepaid` invoke in `stellar.ts`**

Mirror `lockNote` (`stellar.ts:176-190`): `invoke(VEIL_POOL, "release_repaid", [proofScVal(proof), u256Val(nullifier), u256Val(c0), <BytesN<20> scVal>(recipient), u256Val(rootPool), u256Val(rootRepaid)], source)`. The `recipient` arg is the raw 20-byte EVM address as a Soroban `BytesN<20>` ScVal (`xdr.ScVal.scvBytes` of the 20 bytes).

- [ ] **Step 3: Add `isReleased` read in `eth.ts`**

Extend the `VeilEthLock` ABI with `released(uint256) view returns (bool)` (or `isReleased`), add:

```ts
export async function isReleased(C: bigint): Promise<boolean> {
  return publicClient().readContract({ address: VEIL_ETH_LOCK, abi: VEIL_ETH_LOCK_ABI, functionName: "isReleased", args: [C] }) as Promise<boolean>;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd web && pnpm typecheck
git add web/lib/app/stellar.ts web/lib/app/eth.ts web/lib/onchain.ts
git commit -m "feat(web): release_repaid Soroban invoke + Ethereum release read + v2 addresses"
```

---

## Task 12: Web — `REPAY_STEPS` + `runRepayPipeline`

**Files:**
- Modify: `web/lib/app/pipeline.ts`
- Test: `web/lib/app/pipeline.test.ts` (if the crate tests pipeline; else defer to e2e)

**Interfaces:**
- Consumes: `vault.repay` invoke (add if absent in `stellar.ts`), `proveRelease`+`buildReleaseWitness` (Task 10), `releaseRepaid`+`isReleased` (Task 11), `waitForAxelarApproval` (existing `axelar.ts`), `poolLeafEvents` + repaid-tree reconstruction.
- Produces: `REPAY_STEPS`, `runRepayPipeline(note, ctx, onStep)`. Consumed by Task 13 (RepayFlow).

- [ ] **Step 1: Define `REPAY_STEPS`**

```ts
export const REPAY_STEPS = [
  { key: "repay", label: "Repay USDC on Stellar" },
  { key: "prove", label: "Prove release (browser)" },
  { key: "release", label: "Submit release to the pool" },
  { key: "axelar", label: "Relay to Ethereum (Axelar)" },
  { key: "released", label: "WETH released on Sepolia" },
] as const;
export type RepayStepKey = (typeof REPAY_STEPS)[number]["key"];
```

- [ ] **Step 2: Implement `runRepayPipeline` (resumable, status-gated)**

Mirror `runBorrowPipeline`. Each step gated on `note.status`/live state so a reload resumes:
1. `repay`: if status `borrowed`, call `vault.repay(positionId)`; `applyPatch(status:"repaid", repayTx)`.
2. `prove`: rebuild the pool Merkle path (from `poolLeafEvents()`) for `commitmentLocked` and the repaid path (from the vault's repaid-tree events/getter), compute `recipientField = keccak256(recipientAddrBytes) mod BN254_R`, `buildReleaseWitness(toReleaseNote(note), poolPath, repaidPath, recipientField)`, `proveRelease(witness)`.
3. `release`: `releaseRepaid(proof, nullifier, c0, recipientBytes, rootPool, rootRepaid, source)`; `applyPatch(releaseTx)`.
4. `axelar`: `waitForAxelarApproval(releaseTx, {onUpdate})` (reuse the 20-min/15-s poller — it already covers the reverse hop).
5. `released`: poll `isReleased(c0)` until true (or read the `Released` event); `applyPatch(status:"released", releaseEthTx)`.

`c0 = BigInt(note.commitmentAvailable)`; `recipient` = the connected MetaMask EVM address.

- [ ] **Step 3: Add `repay` invoke to `stellar.ts` if missing**

`invoke(VEIL_VAULT, "repay", [u256Val(positionId)], source)`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd web && pnpm typecheck && pnpm test
git add web/lib/app/pipeline.ts web/lib/app/stellar.ts web/lib/app/pipeline.test.ts
git commit -m "feat(web): repay-release reverse pipeline (resumable)"
```

---

## Task 13: Web — `RepayFlow` component, `NoteCard` lifecycle, copy

**Files:**
- Create: `web/components/app/RepayFlow.tsx`
- Modify: `web/components/app/NoteCard.tsx`, `web/app/globals.css`

**Interfaces:**
- Consumes: `REPAY_STEPS`, `runRepayPipeline` (Task 12).
- Produces: a `RepayFlow` rendered by `NoteCard` when `note.status === "borrowed"`.

- [ ] **Step 1: Write `RepayFlow.tsx` (mirror `BorrowFlow.tsx`)**

Copy `BorrowFlow.tsx`, swap `BORROW_STEPS`→`REPAY_STEPS`, `runBorrowPipeline`→`runRepayPipeline`, wrap in `.repay-flow`, require BOTH the Stellar wallet (for `repay`) and the MetaMask EVM address (the release recipient) connected; button label "Repay & release WETH". Extend `friendly()` with a message for the Axelar-wait/"give the relay a moment" case.

- [ ] **Step 2: Extend `NoteCard.tsx`**

Add pill labels (the `Record<NoteStatus,string>` PILL is a compile-time exhaustiveness gate — adding `repaid`/`released` to `NoteStatus` forces these):

```ts
  repaid: "Repaid",
  released: "WETH released",
```

Render `<RepayFlow note={note} onRepaid={…} />` when `note.status === "borrowed"`; add tx-link `Fact`s for `repayTx`, `releaseTx`, `releaseEthTx` (mirror the existing lifecycle facts). The `released` state shows a terminal "WETH returned to <addr>" summary.

- [ ] **Step 3: Add the CSS pill**

In `web/app/globals.css`, add (near `.pos-pill.repaid` at line 1944):

```css
.pos-pill.released { color: var(--emerald, #34d399); }
```

- [ ] **Step 4: Flip the honest copy**

Replace the U8 "repay-to-unlock is the next milestone" framing with the now-live repay-release; keep the shielded-WETH-pool line as the stated next milestone (now also the home of liquidation-release). Grep for the milestone copy string and update it.

- [ ] **Step 5: Typecheck + build + commit**

```bash
cd web && pnpm typecheck && pnpm build
git add web/components/app/RepayFlow.tsx web/components/app/NoteCard.tsx web/app/globals.css
git commit -m "feat(web): RepayFlow + NoteCard repaid/released lifecycle + copy flip"
```

---

## Task 14: Full testing gate

**Files:** none (verification only)

- [ ] **Step 1: Circuits**

```bash
cd circom
node lock_test_js/generate_witness.js lock_test_js/lock_test.wasm lock_input.json /tmp/l.wtns && snarkjs groth16 prove lock.zkey /tmp/l.wtns /tmp/lp.json /tmp/lpub.json && snarkjs groth16 verify keys/lock.vk.json /tmp/lpub.json /tmp/lp.json
node release_repaid_test_js/generate_witness.js release_repaid_test_js/release_repaid_test.wasm release_repaid_input.json /tmp/r.wtns && snarkjs groth16 prove release_repaid.zkey /tmp/r.wtns /tmp/rp.json /tmp/rpub.json && snarkjs groth16 verify keys/release_repaid.vk.json /tmp/rpub.json /tmp/rp.json
```

Expected: both `OK!`. Plus the attack witness (Task 2 Step 7) still fails.

- [ ] **Step 2: Soroban**

```bash
cd contracts/veil-pool && cargo test --release
cd ../veil-verifier && VERIFIER_VK_JSON=../../circom/keys/release_repaid.vk.json cargo test --release
```

Expected: green.

- [ ] **Step 3: Solidity**

```bash
cd contracts/escrow && forge test
```

Expected: all pass (v1 + v2 suites).

- [ ] **Step 4: Web**

```bash
cd web && pnpm typecheck && pnpm test && pnpm build && pnpm verify:lock-prover && pnpm verify:release-prover
```

Expected: typecheck 0 errors, all vitest green (75 + new), build PASS, both prover verifies OK on-chain.

- [ ] **Step 5: Commit any fixups**

```bash
git commit -am "test: full reverse-leg gate green" --allow-empty
```

---

## Task 15: Live reverse e2e

**Files:** none (append tx hashes to `DEPLOYMENTS.md`)

- [ ] **Step 1: Fresh forward leg on the v2 stack**

In the app (or via the e2e scripts): create a note, lock real WETH on `<VEIL_ETH_LOCK_V2>` (B1′ lock, carrying `r`), wait Axelar → `<POOL_V2_ID>.execute` mints the AVAILABLE note, `lock` (AVAILABLE→LOCKED), `borrow` real USDC from the vault. Record each tx hash.

- [ ] **Step 2: Repay**

Call `vault.repay(positionId)` — confirm `repaid_root()` advances (read the getter before/after).

- [ ] **Step 3: Prove + submit release**

Run the repay pipeline: build the release witness from the stored note + `r`, `proveRelease`, `release_repaid` on the pool. Confirm the nullifier is spent and the outbound Axelar `ContractCall` event is emitted.

- [ ] **Step 4: Relay + release**

Wait for Axelar approval; if auto-execution stalls (under-funded gas), manually execute via Axelarscan (spec §5.4 fallback). Confirm `VeilEthLockV2.execute` fires and `Released(C, recipient, amount)` is emitted; `isReleased(C) == true`; the recipient's WETH balance increased by the full escrow.

- [ ] **Step 5: Negative — double-release blocked**

Re-submit the same `release_repaid` → pool rejects (`nullifier already spent`). Re-deliver the same Axelar payload → `VeilEthLockV2` rejects (`AlreadyReleased`).

- [ ] **Step 6: Record**

Append all e2e tx hashes (lock, execute, lock-note, borrow, repay, release, Axelar GMP id, release-eth) to `DEPLOYMENTS.md`.

```bash
git add DEPLOYMENTS.md && git commit -m "chore: live repay-release reverse e2e tx hashes"
```

- [ ] **Step 7: Hand off for the user's hands-on test + demo**

Per the parent plan: user tests the reverse round-trip in the app, then the demo is produced. (U10 live forward e2e + U11 cleanup/demo remain in the parent 11-unit plan.)

---

## Self-Review

**Spec coverage:**
- §2.5 B1′ binding → Task 1 (lock constraint) + Task 2 (release re-proves it) + Task 2 Step 7 (attack fails). ✓
- §2.6 liquidation deferral → enforced by omission (no `release_liquidated`, no `vault.liquidate` change); Global Constraints. ✓
- §3.1 circuits → Tasks 1–2. ✓
- §3.2 pool (release entrypoint, lock-verifier swap, outbound Axelar, redeploy) → Tasks 4–6. ✓
- §3.3 VeilEthLock v2 → Tasks 7–8. ✓
- §3.4 web (re-vendor lock, vendor release, pipeline, RepayFlow, persist r, copy) → Tasks 9–13. ✓
- §5 failure modes → binding (T1/T2 attack), liquidation (deferred), dest-string (T8 empirical), under-funded gas (T8 calibration + Axelarscan fallback), double-release (T5 try_spend + T7 released[C0] + T15 Step 5), source pinning (T7 execute guards), chain rotation (T6 Step 1 getChains), latency (T12 resumable wait), unit consistency (full WETH release, no split). ✓
- §7 open items → ConfigKeys/setters (T4), lock-verifier slot reuse (T6 uses LockVerifier slot with new addr), recipient field-encoding (T5 recipient_field + T2 fixture), getChains re-verify (T6 S1), r persistence (T9). ✓

**Placeholder scan:** deploy-output addresses (`<POOL_V2_ID>` etc.) are interface outputs of earlier tasks, not code placeholders. The one genuinely-empirical value — the `pay_gas` `authorize_as_current_contract` sub-invocation args — is flagged with the concrete best-known code + a sanctioned calibration step (spec §5.4), plus `call_contract` alone guarantees atomicity and Axelarscan is the fallback. The `GasBudget` one-time-setter trap is resolved by adding a mutable `set_gas_budget` (Task 8 Step 4 note → fold into Task 4). Circuit/entrypoint/Solidity/web code is complete.

**Type consistency:** public-signal order `[nullifierOut, C0, recipient, rootPool, rootRepaid]` is identical across the circuit (Task 2), the pool `pi` vector (Task 5), and `publicSignalsToReleaseArgs` (Task 10). `r`/`0x35`/`DS_LOCKBIND`/`53` consistent across lock circuit, release circuit, JS `createNote`, and fixtures. `recipient_field = keccak256(addr) mod BN254_R` identical in the pool (Rust) and the witness (JS/viem). `releaseRepaid` arg order matches the entrypoint signature.

**Fix applied inline:** Task 4 gains a mutable admin `set_gas_budget(i128)` (referenced by Task 8) so gas calibration never forces a pool redeploy.
