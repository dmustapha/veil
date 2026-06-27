import { DEPLOYED } from "@/lib/constants";
import { ExternalIcon } from "./icons";

const ROWS = [
  DEPLOYED.escrow,
  DEPLOYED.vault,
  DEPLOYED.verifier,
  DEPLOYED.borrowTx,
  DEPLOYED.unlockTx,
];

export function DeployedContracts() {
  return (
    <section className="section-pad wrap">
      <div className="section-head reveal">
        <div className="section-kicker">Live on real testnets</div>
        <h2 className="section-title">Deployed contracts and on-chain proof.</h2>
        <p className="section-lead">
          Real escrow on Ethereum Sepolia, a real Soroban vault and verifier on
          Stellar, and the transactions that disbursed and unlocked the loan.
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
