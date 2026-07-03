import type { Metadata } from "next";

import {
  ChannelsBoard,
  type ChannelAlertSeed,
  type ChannelEventSeed,
  type ChannelResponseSeed,
  type ChannelZoneSeed,
} from "@/components/channels/channels-board";
import { StandaloneShell } from "@/components/standalone-shell";
import { getRuntimeRepositories } from "@/db/runtime";
import { haversineMeters } from "@/domain/geo";

export const metadata: Metadata = {
  title: "Field channels — CoExist Alert",
};

export const dynamic = "force-dynamic";

/** The rail-control persona acknowledging advisories (role-switcher POC). */
const CONTROL_RESPONDER_ID = "nfr-chalsa-control";

const DAY_MS = 24 * 60 * 60 * 1_000;

function buildChannelSeed(repos: ReturnType<typeof getRuntimeRepositories>): {
  zones: ChannelZoneSeed[];
  alerts: ChannelAlertSeed[];
  events: ChannelEventSeed[];
  responses: ChannelResponseSeed[];
  nodeNames: Record<string, string>;
  responderNames: Record<string, string>;
} {
  const nodes = repos.nodes.list();

  // Same membership rule the cascade planner applies at dispatch time.
  // Covered hamlets first; the out-of-geofence contrast closes the story.
  const zones: ChannelZoneSeed[] = repos.villagerZones
    .list()
    .map((zone) => ({
      id: zone.id,
      label: zone.label,
      coveredByNames: nodes
        .filter(
          (node) =>
            haversineMeters(zone.lat, zone.lng, node.lat, node.lng) <=
            node.geofenceRadiusM,
        )
        .map((node) => node.name),
    }))
    .sort(
      (a, b) =>
        Number(b.coveredByNames.length > 0) -
          Number(a.coveredByNames.length > 0) ||
        a.label.localeCompare(b.label),
    );

  const monthAgoIso = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const alerts: ChannelAlertSeed[] = [];
  for (const alert of repos.alerts.listSince(monthAgoIso)) {
    if (alert.eventId === null) continue;
    if (alert.channel !== "villager_phone" && alert.channel !== "control_room")
      continue;
    alerts.push({
      id: alert.id,
      eventId: alert.eventId,
      channel: alert.channel,
      targetRef: alert.targetRef,
      status: alert.status,
      queuedAt: alert.queuedAt,
      isLive: alert.isLive,
    });
  }

  const eventIds = [...new Set(alerts.map((alert) => alert.eventId))];
  const events: ChannelEventSeed[] = [];
  const responses: ChannelResponseSeed[] = [];
  for (const eventId of eventIds) {
    const event = repos.events.findById(eventId);
    if (event === null) continue;
    events.push({
      id: event.id,
      nodeId: event.nodeId,
      state: event.state,
      speciesLabel: event.speciesLabel,
      openedAt: event.openedAt,
      confirmedAt: event.confirmedAt,
    });
    for (const response of repos.responses.listForEvent(eventId)) {
      responses.push({
        id: response.id,
        eventId,
        responderId: response.responderId,
        action: response.action,
        at: response.at,
      });
    }
  }

  return {
    zones,
    alerts,
    events,
    responses,
    nodeNames: Object.fromEntries(nodes.map((node) => [node.id, node.name])),
    responderNames: Object.fromEntries(
      repos.responders.list().map((responder) => [responder.id, responder.name]),
    ),
  };
}

export default function ChannelsViewPage() {
  const { zones, alerts, events, responses, nodeNames, responderNames } =
    buildChannelSeed(getRuntimeRepositories());

  return (
    <StandaloneShell wide sound>
      <header>
        <h1 className="text-3xl">Field channels</h1>
        <p className="mt-1 text-sm text-muted">
          Villager phone feed and rail-control advisory strip — all times IST.
        </p>
      </header>
      <ChannelsBoard
        zones={zones}
        initialAlerts={alerts}
        initialEvents={events}
        initialResponses={responses}
        nodeNames={nodeNames}
        responderNames={responderNames}
        controlResponderId={CONTROL_RESPONDER_ID}
      />
    </StandaloneShell>
  );
}
