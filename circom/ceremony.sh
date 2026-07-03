#!/usr/bin/env bash
# Veil v3 — per-circuit Groth16 phase-2 trusted setup (Phase 3).
#
# ⚠️ SINGLE-PARTY dev ceremony — NOT SOUND FOR REAL FUNDS (hackathon/testnet only).
# BOTH phases are single-party and locally generated:
#   * phase-1 (powers-of-tau `ptau/pot15_final.ptau`, bn128 2^15) was generated locally with one
#     contribution — NOT sourced from a public perpetual/Hermez ceremony;
#   * phase-2 is one `zkey contribute` per circuit here.
# So a single operator holds BOTH the phase-1 toxic waste (τ) AND every circuit's phase-2 waste (δ),
# and could forge a valid proof for ANY statement of ANY circuit WITHOUT a witness (e.g. a borrow
# against a note never deposited, a seize against a healthy position). Per-circuit soundness IS
# intact (each circuit gets its own independent zkey/vkey — no shared δ across circuits).
#
# PRODUCTION requires: (a) phase-1 from a public perpetual-powers-of-tau file; (b) multi-party
# phase-2 (≥2 independent `zkey contribute` + a public randomness beacon per circuit); (c) published
# contribution hashes + `snarkjs zkey verify` transcript. The verification keys committed under
# `keys/*.vk.json` are what gets embedded in the on-chain verifier.
#
# Reproduce: `cd circom && npm i && bash ceremony.sh`  (regenerates <c>.zkey locally + keys/<c>.vk.json)
#
# ⚠️ NON-DETERMINISTIC: `zkey contribute` mixes OS randomness, so each run produces a DIFFERENT
# zkey+vk. Re-running for an UNCHANGED circuit INVALIDATES its committed vk vs the live deployed
# verifier. Only re-ceremony a circuit whose .r1cs actually changed. Pass circuit name(s) explicitly;
# the no-arg full-loop is disabled to prevent accidental clobber of deployed circuits' keys.
set -e
CIRCUITS=("$@")
if [ ${#CIRCUITS[@]} -eq 0 ]; then
  echo "usage: bash ceremony.sh <circuit> [<circuit> ...]   (only circuits whose .r1cs changed)"
  exit 1
fi
for c in "${CIRCUITS[@]}"; do
  echo "=== $c ==="
  snarkjs groth16 setup "${c}_test.r1cs" ptau/pot15_final.ptau "/tmp/${c}_0000.zkey"
  snarkjs zkey contribute "/tmp/${c}_0000.zkey" "${c}.zkey" \
    --name="veil-${c}-contrib-1" -e="veil v3 ${c} phase2 single-party dev ceremony"
  snarkjs zkey export verificationkey "${c}.zkey" "keys/${c}.vk.json"
done
echo "vkeys → keys/*.vk.json ; proving zkeys → circom/<c>.zkey (gitignored)"
