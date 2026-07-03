// Validate the Axelar GMP parser against a LIVE (historical) message — the Phase-7-real lock whose
// Sepolia tx and message id are pinned in DEPLOYMENTS.md. Confirms parseGmpResponse lifts the exact
// approved.returnValues.messageId + source address the pool's execute needs. Read-only.
import { fetchAxelarStatus } from "../lib/app/axelar";

const SOURCE_TX = "0x6903206311608c7d73396c533bab95da1a35f8692f140db9f1105d562d84d7f9";
const EXPECT_MESSAGE_ID = `${SOURCE_TX}-3`;
const EXPECT_SOURCE = "0xE114C79D44Fe888FB2dbF962A29023771Ef3B1D2";

const fail = (m: string) => { console.error(`✗ ${m}`); process.exitCode = 1; };

async function main() {
  const m = await fetchAxelarStatus(SOURCE_TX);
  console.log(`status        = ${m.status}`);
  console.log(`messageId     = ${m.messageId}`);
  console.log(`sourceAddress = ${m.sourceAddress}`);
  console.log(`sourceChain   = ${m.sourceChain}`);

  if (m.messageId !== EXPECT_MESSAGE_ID) fail(`messageId != ${EXPECT_MESSAGE_ID}`);
  if (m.sourceAddress !== EXPECT_SOURCE) fail(`sourceAddress != ${EXPECT_SOURCE}`);
  if (m.status !== "executed") fail(`expected historical message status 'executed', got '${m.status}'`);
  if (!process.exitCode) console.log("✓ Axelar GMP parser matches the live historical message");
}

main().catch((e) => { console.error(e); process.exit(1); });
