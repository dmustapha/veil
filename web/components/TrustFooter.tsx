import { CheckIcon, InfoIcon, ShieldIcon } from "./icons";

export function TrustFooter() {
  return (
    <section className="section-pad wrap" id="trust">
      <div className="trust reveal">
        <div className="trust-head">
          <div className="th-icon" aria-hidden="true">
            <ShieldIcon />
          </div>
          <div className="trust-title">The trust model</div>
        </div>
        <div className="trust-cols">
          <div className="trust-col trusted">
            <h4>What Veil relies on</h4>
            <div className="trust-item">
              <span className="ti-mark">
                <InfoIcon />
              </span>
              <span>
                <b>Axelar&apos;s validator set</b> carries the cross-chain
                attestation; Veil runs no relayer of its own.
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
                The <b>note commitment is public on both chains</b>, so an
                Ethereum-side observer can correlate the two legs.
              </span>
            </div>
          </div>
          <div className="trust-col ship">
            <h4>What Veil guarantees</h4>
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
                <b>threshold, commitment, nullifier, proof</b>.
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
