import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Workspace } from "@/components/Workspace";
import { ProofArtifact } from "@/components/ProofArtifact";
import { CheatFails } from "@/components/CheatFails";
import { DeployedContracts } from "@/components/DeployedContracts";
import { TrustFooter } from "@/components/TrustFooter";
import { SiteFooter } from "@/components/SiteFooter";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Workspace />
        <ProofArtifact />
        <CheatFails />
        <DeployedContracts />
        <TrustFooter />
      </main>
      <SiteFooter />
    </>
  );
}
