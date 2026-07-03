import { DEPLOYED } from "@/lib/constants";
import { ExternalIcon } from "./icons";

const ROWS = [
  DEPLOYED.ethLock,
  DEPLOYED.pool,
  DEPLOYED.vault,
  DEPLOYED.verifier,
  DEPLOYED.lockTx,
  DEPLOYED.borrowTx,
];

export function DeployedContracts() {
  return (
    <section className="section-pad wrap">
      <div className="section-head reveal">
        <div className="section-kicker">Live on real testnets</div>
        <h2 className="section-title">Deployed contracts and on-chain proof.</h2>
        <p className="section-lead">
          A real WETH lock on Ethereum Sepolia, the Soroban pool, vault, and
          Groth16 verifier on Stellar, and the live cross-chain transactions that
          locked collateral and disbursed the loan.
        </p>
      </div>

      <div className="deployed-list">
        {ROWS.map((row) => (
          <div className="dep-row reveal" key={row.label}>
            <div className="dep-label">
              <span className={`glyph ${row.chain}`} aria-hidden="true" />{" "}
              {row.label}
            </div>
            <div className="dep-addr mono">{row.addr}</div>
            <a
              className="dep-link"
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {row.explorer} <ExternalIcon />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
