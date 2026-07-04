import type { Metadata } from "next";

import { DemoPanel, type DemoNodeSeed } from "@/components/demo/demo-panel";
import { StandaloneShell } from "@/components/standalone-shell";
import { getRuntimeRepositories } from "@/db/runtime";
import { simulatorHealth } from "@/sim/runtime";

export const metadata: Metadata = {
  title: "Demo control panel — CoExist Alert",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function DemoPanelPage() {
  const repos = getRuntimeRepositories();
  const nodes: DemoNodeSeed[] = repos.nodes.list().map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
  }));
  const settings = repos.settings.get();

  const sim = simulatorHealth();
  const initialAmbient = sim.status === "not_started" ? false : sim.ambient;
  const initialKilledNodeIds =
    sim.status === "not_started" ? [] : sim.killedNodeIds;

  return (
    <StandaloneShell wide>
      <header>
        <h1 className="text-3xl">Demo control panel</h1>
        <p className="mt-1 text-sm text-muted">
          Drives the simulated field for demonstrations — all times IST.
        </p>
      </header>
      <DemoPanel
        nodes={nodes}
        initialAmbient={initialAmbient}
        initialKilledNodeIds={initialKilledNodeIds}
        confirmConfidence={settings.confirmConfidence}
      />
    </StandaloneShell>
  );
}
