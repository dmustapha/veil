#!/usr/bin/env bash
# Veil v3 — per-circuit Groth16 phase-2 trusted setup (Phase 3).
#
# SINGLE-PARTY dev ceremony (hackathon-honest): one contribution per circuit off the shared
# powers-of-tau `ptau/pot15_final.ptau` (bn128, 2^15). For production this MUST become a
# multi-party ceremony (each participant runs `snarkjs zkey contribute` in turn, then a random
# beacon) — a single-party setup means the setup operator could forge proofs. The verification
# keys committed under `keys/*.vk.json` are what gets embedded in the on-chain verifier.
#
# Reproduce: `cd circom && npm i && bash ceremony.sh`  (regenerates <c>.zkey locally + keys/<c>.vk.json)
set -e
for c in borrow lock unlock seize; do
  echo "=== $c ==="
  snarkjs groth16 setup "${c}_test.r1cs" ptau/pot15_final.ptau "/tmp/${c}_0000.zkey"
  snarkjs zkey contribute "/tmp/${c}_0000.zkey" "${c}.zkey" \
    --name="veil-${c}-contrib-1" -e="veil v3 ${c} phase2 single-party dev ceremony"
  snarkjs zkey export verificationkey "${c}.zkey" "keys/${c}.vk.json"
done
echo "vkeys → keys/*.vk.json ; proving zkeys → circom/<c>.zkey (gitignored)"
