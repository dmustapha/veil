import Link from "next/link";
import { Nav } from "@/components/Nav";
import { LiveWorkspace } from "@/components/LiveWorkspace";
import { DeployedContracts } from "@/components/DeployedContracts";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Veil workspace: borrow private, proven not revealed",
};

export default function WorkspacePage() {
  return (
    <>
      <Nav />
      <main>
        <section className="app-intro wrap">
          <div className="section-kicker reveal d1">Live workspace</div>
          <h1 className="app-title reveal d2">
            Connect, read the position, and watch the proof gate the money.
          </h1>
          <p className="app-lead reveal d3">
            Everything below reads the deployed contracts on Ethereum Sepolia and
            Stellar testnet. The collateral amount stays hidden, the loan settles
            against a threshold, and a tampered proof is rejected live. The full
            story lives on the{" "}
            <Link className="tx-inline" href="/">
              landing page
            </Link>
            .
          </p>
        </section>
        <LiveWorkspace />
        <DeployedContracts />
      </main>
      <SiteFooter />
    </>
  );
}
