#!/usr/bin/env bash
# Deploy Veil v2 vault (Soroban) to Stellar testnet: build wasm -> deploy -> init (11 args) ->
# optional add_root / lp_deposit. Idempotent notes: `init` reverts (AlreadyInitialized) if re-run
# against the same contract; deploy a fresh contract to re-init.
#
# This is a RUNBOOK — run it in the deploy phase once CI has produced the REAL v2 borrow image_id.
# It never prints secrets (the source is a key ALIAS resolved by the stellar CLI, not a raw key).
#
# Required env:
#   SOROBAN_SOURCE   stellar keys alias for the admin/deployer (e.g. `veil-admin`)
#   IMAGE_ID         REAL v2 borrow guest image_id (hex, 0x optional) from CI image-ids.json
# Optional env (testnet defaults reuse the live SEP-40 / verifier ids from DEPLOYMENTS.md):
#   NETWORK          default: testnet
#   ADMIN            default: address of SOROBAN_SOURCE
#   VERIFIER         default: Nethermind RISC Zero Soroban verifier
#   USDC             default: Circle USDC testnet SAC
#   REFLECTOR        default: Reflector ETH feed
#   REFLECTOR_ASSET  default: {"Other":"ETH"}
#   LTV_BPS          default: 2500   (25% loan-to-value)
#   LIQ_BPS          default: 8000   (liquidation threshold; MUST be > LTV_BPS)
#   MIN_THRESHOLD    default: 1      (min proven floor T, wstETH base-units; tune per demo)
#   TERM_LEDGERS     default: 120960 (~7 days)
#   RATE_BPS         default: 500    (5%/yr borrow interest)
#   ROOT             optional: initial known Ethereum VeilPool root to seed via add_root
#   LP_ASSETS        optional: initial USDC to lp_deposit (needs a USDC trustline + balance)
#   DRY_RUN          if set, print the commands instead of running them (offline verification)
set -euo pipefail

: "${SOROBAN_SOURCE:?set SOROBAN_SOURCE to a stellar keys alias}"
: "${IMAGE_ID:?set IMAGE_ID to the REAL v2 borrow image_id from CI}"

NETWORK="${NETWORK:-testnet}"
VERIFIER="${VERIFIER:-CDZRHQMXGWXDTZOPNPHLRJFTAPANBZE3GJNOKLM7FB7AG3EZFP5E5C2L}"
USDC="${USDC:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
REFLECTOR="${REFLECTOR:-CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63}"
REFLECTOR_ASSET="${REFLECTOR_ASSET:-{\"Other\":\"ETH\"}}"
LTV_BPS="${LTV_BPS:-2500}"
LIQ_BPS="${LIQ_BPS:-8000}"
MIN_THRESHOLD="${MIN_THRESHOLD:-1}"
TERM_LEDGERS="${TERM_LEDGERS:-120960}"
RATE_BPS="${RATE_BPS:-500}"

# Normalize image_id to bare hex (the CLI takes BytesN<32> as hex without 0x, matching the v1
# post_checkpoint convention in web/lib/server/prover.ts).
IMAGE_ID_HEX="${IMAGE_ID#0x}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# `run` executes, or (DRY_RUN) prints a shell-quoted preview of the command.
run() {
  if [ -n "${DRY_RUN:-}" ]; then
    printf '   '; printf '%q ' "$@"; printf '\n'
    return 0
  fi
  "$@"
}

echo "==> [1/5] build wasm"
run stellar contract build

# Resolve the built wasm (SDK 25 target is wasm32v1-none; glob to stay version-robust).
if [ -n "${DRY_RUN:-}" ]; then
  WASM="target/wasm32v1-none/release/veil_vault_v2.wasm"
else
  WASM="$(ls target/*/release/veil_vault_v2.wasm | head -1)"
fi
echo "    wasm: $WASM"

ADMIN="${ADMIN:-}"
if [ -z "$ADMIN" ]; then
  if [ -n "${DRY_RUN:-}" ]; then
    ADMIN='<address of SOROBAN_SOURCE>'
  else
    ADMIN="$(stellar keys address "$SOROBAN_SOURCE")"
  fi
fi
echo "    admin: $ADMIN"

echo "==> [2/5] deploy"
if [ -n "${DRY_RUN:-}" ]; then
  run stellar contract deploy --wasm "$WASM" --source "$SOROBAN_SOURCE" \
    --network "$NETWORK" --alias veil-vault-v2
  VAULT='<deployed-contract-id>'
else
  VAULT="$(stellar contract deploy --wasm "$WASM" --source "$SOROBAN_SOURCE" \
    --network "$NETWORK" --alias veil-vault-v2)"
fi
echo "    VAULT_V2_ID: $VAULT"

echo "==> [3/5] init (11 args)"
run stellar contract invoke --id "$VAULT" --source "$SOROBAN_SOURCE" --network "$NETWORK" \
  -- init \
  --admin "$ADMIN" \
  --verifier "$VERIFIER" \
  --image_id "$IMAGE_ID_HEX" \
  --usdc "$USDC" \
  --reflector "$REFLECTOR" \
  --reflector_asset "$REFLECTOR_ASSET" \
  --ltv_bps "$LTV_BPS" \
  --liq_bps "$LIQ_BPS" \
  --min_threshold "$MIN_THRESHOLD" \
  --term_ledgers "$TERM_LEDGERS" \
  --rate_bps "$RATE_BPS"

echo "==> [4/5] add_root (optional)"
if [ -n "${ROOT:-}" ]; then
  run stellar contract invoke --id "$VAULT" --source "$SOROBAN_SOURCE" --network "$NETWORK" \
    -- add_root --root "${ROOT#0x}"
else
  echo "    (skipped — set ROOT to seed an initial Ethereum pool root; Relayer A keeps it fresh)"
fi

echo "==> [5/5] lp_deposit (optional)"
if [ -n "${LP_ASSETS:-}" ]; then
  run stellar contract invoke --id "$VAULT" --source "$SOROBAN_SOURCE" --network "$NETWORK" \
    -- lp_deposit --from "$ADMIN" --assets "$LP_ASSETS"
else
  echo "    (skipped — set LP_ASSETS to fund the LP pool with USDC; needs a trustline + balance)"
fi

echo
echo "DONE. Record VAULT_V2_ID=$VAULT in DEPLOYMENTS.md and relayer/.env (VAULT_V2_ID)."
