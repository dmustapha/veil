import { CheckIcon, InfoIcon, ShieldIcon } from "./icons";

export function TrustFooter() {
  return (
    <section className="section-pad wrap" id="trust">
      <div className="trust reveal">
        <div className="trust-head">
          <div className="th-icon" aria-hidden="true">
            <ShieldIcon />
          </div>
          <div className="trust-title">Honest about trust</div>
        </div>
        <div className="trust-cols">
          <div className="trust-col trusted">
            <h4>What is still trusted (not trustless)</h4>
            <div className="trust-item">
              <span className="ti-mark">
                <InfoIcon />
              </span>
              <span>
                A <b>checkpoint poster</b> relays Ethereum state to Stellar.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <InfoIcon />
              </span>
              <span>
                A price <b>oracle</b> (Reflector) supplies the ETH valuation.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <InfoIcon />
              </span>
              <span>
                A <b>timeout</b> governs refunds if a leg stalls.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <InfoIcon />
              </span>
              <span>
                The <b>hashlock is public on both chains</b>, so an Ethereum-side
                observer can correlate the two legs.
              </span>
            </div>
          </div>
          <div className="trust-col ship">
            <h4>What Veil actually ships</h4>
            <div className="trust-item">
              <span className="ti-mark">
                <CheckIcon />
              </span>
              <span>
                <b>Stellar-side confidentiality.</b> Your amount and wallet never
                appear on Stellar.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <CheckIcon />
              </span>
              <span>
                The lender, the ledger, and every observer see only{" "}
                <b>threshold, hashlock, nullifier, proof</b>.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <CheckIcon />
              </span>
              <span>
                The <b>proof, not a relayer</b>, is what releases the money.
              </span>
            </div>
            <div className="trust-item">
              <span className="ti-mark">
                <CheckIcon />
              </span>
              <span>
                Collateral <b>never bridges</b>. It stays on Ethereum the whole
                time.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
