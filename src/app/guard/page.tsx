import type { Metadata } from "next";

import {
  GuardConsole,
  type GuardAlertSeed,
  type GuardEventSeed,
  type GuardResponseSeed,
  type GuardSignalSeed,
} from "@/components/guard/guard-console";
import { StandaloneShell } from "@/components/standalone-shell";
import { getRuntimeRepositories } from "@/db/runtime";

export const metadata: Metadata = {
  title: "Guard view — CoExist Alert",
};

export const dynamic = "force-dynamic";

/** The demo guard persona — the role switcher stands in for auth (POC). */
const GUARD_ID = "guard-sharma";

/**
 * Simulated field position for the distance fact (the POC has no device
 * GPS); rendered with a SIMULATED chip. Sits at the Uttar Madhupur school
 * hamlet — a plausible beat post between the two assigned nodes.
 */
const GUARD_POST = {
  label: "Uttar Madhupur beat post",
  lat: 26.866,
  lng: 88.842,
};

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
  const responder = repos.responders.findById(GUARD_ID);

  if (responder === null) {
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
        <h1 className="text-3xl">Guard view</h1>
        <p className="mt-1 text-sm text-muted">
          Mobile response console for beat officers — all times IST.
        </p>
      </header>
      <GuardConsole
        responder={{
          id: responder.id,
          name: responder.name,
          phoneLabel: responder.phoneLabel,
        }}
        post={GUARD_POST}
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
