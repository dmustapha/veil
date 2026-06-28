import { Nav } from "@/components/Nav";
import { AppWorkspace } from "@/components/app/AppWorkspace";
import { DeployedContracts } from "@/components/DeployedContracts";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/lib/constants";

export const metadata = {
  title: "Veil app: borrow private, proven not revealed",
};

export default function AppPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="app-intro wrap">
          <div className="section-kicker reveal" data-d="1">
            Live on {SITE.networks}
          </div>
          <h1 className="app-title reveal" data-d="2">
            Lock collateral, prove it privately, and borrow USDC.
          </h1>
          <p className="app-lead reveal" data-d="3">
            Connect both wallets, lock your own test ETH on Ethereum, then let a
            zero-knowledge proof unlock real Circle USDC on Stellar. Every action
            here is a real transaction you sign. Your collateral amount never
            leaves your wallet view; proving runs off-chain and takes a few minutes.
          </p>
        </section>
        <AppWorkspace />
        <DeployedContracts />
      </main>
      <SiteFooter />
    </>
  );
}
