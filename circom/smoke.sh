#!/usr/bin/env bash
# Per-circuit Groth16 prove/verify smoke (Phase-2 local check; the real ceremony is Phase 3).
# Usage: smoke.sh <name>   — expects <name>_test.r1cs + /tmp/<name>.wtns, uses ptau/pot15_final.ptau.
set -e
n="$1"
snarkjs groth16 setup "${n}_test.r1cs" ptau/pot15_final.ptau "${n}.zkey" >/dev/null 2>&1
snarkjs zkey export verificationkey "${n}.zkey" "${n}_vkey.json" >/dev/null 2>&1
snarkjs groth16 prove "${n}.zkey" "/tmp/${n}.wtns" "${n}_proof.json" "${n}_public.json" >/dev/null 2>&1
snarkjs groth16 verify "${n}_vkey.json" "${n}_public.json" "${n}_proof.json" 2>&1 | grep -iE "OK|INVALID"
