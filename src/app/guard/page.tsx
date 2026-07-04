import type { Metadata } from "next";

import {
  GuardConsole,
  type GuardAlertSeed,
  type GuardEventSeed,
  type GuardLadderRung,
  type GuardPostSeed,
  type GuardResponseSeed,
  type GuardSignalSeed,
} from "@/components/guard/guard-console";
import { StandaloneShell } from "@/components/standalone-shell";
import { getRuntimeRepositories } from "@/db/runtime";
import type { Responder } from "@/domain/types";

export const metadata: Metadata = {
  title: "Guard view — CoExist Alert",
};

export const dynamic = "force-dynamic";

/** Default persona — the role switcher stands in for auth (POC). */
const DEFAULT_RESPONDER_ID = "guard-sharma";

/**
 * Persona chrome per responder. The first-line beat officer carries a
 * simulated field position (the distance fact is honest only with a labelled
 * post at the Uttar Madhupur school hamlet); the escalation tiers coordinate
 * remotely, so they show no beat post.
 */
function personaChrome(responder: Responder): {
  title: string;
  subtitle: string;
  post: GuardPostSeed | null;
} {
  if (responder.tier === 1) {
    return {
      title: "Guard view",
      subtitle: "Mobile response console for beat officers — all times IST.",
      post: { label: "Uttar Madhupur beat post", lat: 26.866, lng: 88.842 },
    };
  }
  if (responder.role === "district_officer") {
    return {
      title: "District duty console",
      subtitle:
        "Final escalation tier — alerts arrive here when neither first nor rapid response answers. All times IST.",
      post: null,
    };
  }
  return {
    title: "Range response console",
    subtitle:
      "Rapid-response console — alerts escalate here when the beat officer doesn't answer in time. All times IST.",
    post: null,
  };
}

const HISTORY_LIMIT = 8;

export default async function GuardViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const eventIdParam = params.eventId;
  const focusEventId =
    typeof eventIdParam === "string" && eventIdParam.length > 0
      ? eventIdParam
      : null;

  const repos = getRuntimeRepositories();

  // Field responders form the escalation ladder (tier 1 → 3); the control-room
  // desk lives on the Channels view, not here. The role switcher targets a
  // persona via ?as=<id>; anything unknown falls back to the beat officer.
  const fieldResponders = repos.responders
    .list()
    .filter((r) => r.role === "guard" || r.role === "district_officer")
    .sort((a, b) => a.tier - b.tier);
  const ladder: GuardLadderRung[] = fieldResponders.map((r) => ({
    tier: r.tier,
    name: r.name,
  }));

  const asParam = params.as;
  const requestedId = typeof asParam === "string" ? asParam : null;
  const responder =
    fieldResponders.find((r) => r.id === requestedId) ??
    fieldResponders.find((r) => r.id === DEFAULT_RESPONDER_ID) ??
    fieldResponders[0] ??
    null;

  if (responder === undefined || responder === null) {
    return (
      <StandaloneShell>
        <header>
          <h1 className="text-3xl">Guard view</h1>
        </header>
        <p className="rounded-lg border border-line bg-raised px-6 py-12 text-center text-sm text-muted">
          No guard responder is provisioned — run <code>npm run setup</code> to
          seed the demo field.
        </p>
      </StandaloneShell>
    );
  }

  const chrome = personaChrome(responder);

  const nodes = repos.nodes
    .list()
    .filter((node) => responder.nodeIds.includes(node.id));
  const assignedNodeIds = new Set(nodes.map((node) => node.id));

  const assignedEvents = repos.events
    .list()
    .filter((event) => assignedNodeIds.has(event.nodeId));
  const activeEvents = assignedEvents.filter(
    (event) => event.state === "confirmed" || event.state === "responding",
  );
  const resolvedEvents = assignedEvents
    .filter((event) => event.state === "resolved")
    .sort((a, b) =>
      (b.resolvedAt ?? b.openedAt).localeCompare(a.resolvedAt ?? a.openedAt),
    )
    .slice(0, HISTORY_LIMIT);
  const seedEvents = [...activeEvents, ...resolvedEvents];

  const eventSeeds: GuardEventSeed[] = seedEvents.map((event) => ({
    id: event.id,
    nodeId: event.nodeId,
    state: event.state,
    speciesLabel: event.speciesLabel,
    openedAt: event.openedAt,
    confirmedAt: event.confirmedAt,
    resolvedAt: event.resolvedAt,
  }));
  const signalSeeds: GuardSignalSeed[] = activeEvents.flatMap((event) =>
    repos.signals.listForEvent(event.id).map((signal) => ({
      id: signal.id,
      eventId: signal.eventId,
      at: signal.at,
      source: signal.source,
      classification: signal.classification,
      confidence: signal.confidence,
      snapshotPath: signal.snapshotPath,
    })),
  );
  const alertSeeds: GuardAlertSeed[] = activeEvents.flatMap((event) =>
    repos.alerts.listForEvent(event.id).map((alert) => ({
      id: alert.id,
      eventId: event.id,
      channel: alert.channel,
      status: alert.status,
      tier: alert.tier,
      queuedAt: alert.queuedAt,
      isLive: alert.isLive,
    })),
  );
  const responseSeeds: GuardResponseSeed[] = seedEvents.flatMap((event) =>
    repos.responses.listForEvent(event.id).map((response) => ({
      id: response.id,
      eventId: event.id,
      responderId: response.responderId,
      action: response.action,
      at: response.at,
    })),
  );

  const settings = repos.settings.get();

  return (
    <StandaloneShell sound>
      <header>
        <h1 className="text-3xl">{chrome.title}</h1>
        <p className="mt-1 text-sm text-muted">{chrome.subtitle}</p>
      </header>
      <GuardConsole
        responder={{
          id: responder.id,
          name: responder.name,
          phoneLabel: responder.phoneLabel,
          tier: responder.tier,
        }}
        post={chrome.post}
        ladder={ladder}
        nodes={nodes.map((node) => ({
          id: node.id,
          name: node.name,
          kind: node.kind,
          status: node.status,
          lat: node.lat,
          lng: node.lng,
        }))}
        initialEvents={eventSeeds}
        initialSignals={signalSeeds}
        initialAlerts={alertSeeds}
        initialResponses={responseSeeds}
        escalationTimeoutS={settings.escalationTimeoutS}
        focusEventId={focusEventId}
      />
    </StandaloneShell>
  );
}
