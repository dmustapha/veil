import { CHEAT } from "@/lib/constants";
import { CheckIcon, ReplayIcon, WarningIcon } from "./icons";

export function CheatFails() {
  return (
    <section className="section-pad wrap">
      <div className="section-head reveal">
        <div className="section-kicker">The cheat that fails</div>
        <h2 className="section-title">
          Tamper with the proof and nothing moves.
        </h2>
        <p className="section-lead">
          The verifier gates the money. A forged proof and a replayed proof both
          get rejected on-chain, and the loan balance stays exactly where it was.
        </p>
      </div>

      <div className="cheat-grid">
        <div className="cheat-card reveal">
          <div className="cc-head">
            <div className="cc-icon" aria-hidden="true">
              <WarningIcon />
            </div>
            <div className="cc-title">Forged proof</div>
          </div>
          <p className="cc-flow">
            A fabricated proof is submitted to the Soroban verifier. The BN254
            pairing check rejects it before any disbursement logic runs.
          </p>
          <div className="cc-error mono">
            {CHEAT.forged.code}
            <br />
            {CHEAT.forged.reason}
          </div>
          <div className="cc-outcome">
            <CheckIcon /> No USDC moves
          </div>
        </div>

        <div className="cheat-card reveal">
          <div className="cc-head">
            <div className="cc-icon" aria-hidden="true">
              <ReplayIcon />
            </div>
            <div className="cc-title">Replayed valid proof</div>
          </div>
          <p className="cc-flow">
            A real, already-spent proof is submitted again. The nullifier is
            recorded, so the contract refuses a second loan from one lock.
          </p>
          <div className="cc-error mono">{CHEAT.replay.code}</div>
          <div className="cc-outcome">
            <CheckIcon /> One lock, one loan
          </div>
        </div>
      </div>
    </section>
  );
}
