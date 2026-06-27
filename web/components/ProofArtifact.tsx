import { PROOF } from "@/lib/constants";
import { EyeIcon, EyeOffIcon, ShieldCheckIcon } from "./icons";

export function ProofArtifact() {
  return (
    <section className="section-pad wrap" id="proof">
      <div className="section-head reveal">
        <div className="section-kicker">The proof, as an object</div>
        <h2 className="section-title">
          A 260-byte cryptographic artifact, not a promise.
        </h2>
        <p className="section-lead">
          Proving takes minutes and happens off-chain, so the proof arrives
          pre-sealed. Stellar verifies its public outputs and never sees the
          private witnesses behind it.
        </p>
      </div>

      <div className="proof-grid">
        <div className="artifact reveal">
          <div className="seal-row">
            <div className="seal" aria-hidden="true">
              <ShieldCheckIcon />
            </div>
            <div className="seal-meta">
              <div className="sm-t">RISC Zero Groth16 seal</div>
              <div className="sm-s">
                Verified by a BN254 pairing inside a Soroban contract
              </div>
            </div>
          </div>
          <div className="kv">
            <div className="kv-k">Proof system</div>
            <div className="kv-v">{PROOF.system}</div>
            <div className="kv-k">Size</div>
            <div className="kv-v">{PROOF.size}</div>
            <div className="kv-k">Seal selector</div>
            <div className="kv-v mono">{PROOF.sealSelector}</div>
            <div className="kv-k">Image ID</div>
            <div className="kv-v mono">{PROOF.imageId}</div>
            <div className="kv-k">Generated</div>
            <div className="kv-v">
              Off-chain, pre-sealed (proving takes minutes)
            </div>
          </div>
        </div>

        <div className="public-card reveal">
          <div className="pub-item">
            <div className="pk">
              <EyeIcon width={13} height={13} /> Public output: threshold
            </div>
            <div className="pv">≥ 0.005 ETH (5e15 wei)</div>
          </div>
          <div className="pub-item">
            <div className="pk">
              <EyeIcon width={13} height={13} /> Public output: hashlock +
              nullifier
            </div>
            <div className="pv">one lock, one loan, no replay</div>
          </div>
          <div className="pub-item private">
            <div className="pk">
              <EyeOffIcon width={13} height={13} /> Private witness: exact amount
            </div>
            <div className="pv">never leaves the prover</div>
          </div>
          <div className="pub-item private">
            <div className="pk">
              <EyeOffIcon width={13} height={13} /> Private witness: Ethereum
              address
            </div>
            <div className="pv">never appears on Stellar</div>
          </div>
        </div>
      </div>
    </section>
  );
}
