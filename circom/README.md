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

## Build (artifacts gitignored)
```
circom compress_test.circom --r1cs --wasm --sym -o .
node compress_test_js/generate_witness.js compress_test_js/compress_test.wasm input.json out.wtns
snarkjs wtns export json out.wtns out.json
```
