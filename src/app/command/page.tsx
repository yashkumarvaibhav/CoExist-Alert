import type { Metadata } from "next";
import Link from "next/link";

import {
  ActiveCascades,
  type CascadeAlertSeed,
  type CascadeEventSeed,
  type CascadeResponseSeed,
} from "@/components/command/active-cascades";
import {
  HealthBoard,
  type OpenOutageSeed,
} from "@/components/command/health-board";
import { KpiStrip, type KpiTileData } from "@/components/command/kpi-strip";
import { LiveFeed, type FeedItem } from "@/components/command/live-feed";
import { LiveMap } from "@/components/command/live-map";
import { getRuntimeRepositories } from "@/db/runtime";
import {
  leadTimeStats,
  overallDeliveryRate,
  uptimePct,
  type Metric,
} from "@/domain/metrics";
import { bucketMeans } from "@/lib/sparkline";

export const metadata: Metadata = {
  title: "Command dashboard — CoExist Alert",
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const SPARKLINE_BUCKET_MINUTES = 30;
const INSUFFICIENT = { value: "n < 5", sub: "not enough data yet", insufficient: true };

function computeKpiTiles(
  repos: ReturnType<typeof getRuntimeRepositories>,
): KpiTileData[] {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const dayAgoIso = new Date(nowMs - DAY_MS).toISOString();
  const monthAgoIso = new Date(nowMs - 30 * DAY_MS).toISOString();

  const nodes = repos.nodes.list();
  const uptimes = nodes
    .map((node) =>
      uptimePct(node, repos.outages.listForNode(node.id), {
        from: dayAgoIso,
        to: nowIso,
      }),
    )
    .filter((metric): metric is Extract<Metric, { kind: "ok" }> => metric.kind === "ok");
  const uptimeTile: KpiTileData =
    uptimes.length === 0
      ? { label: "Sensor uptime", ...INSUFFICIENT }
      : {
          label: "Sensor uptime",
          value: `${(
            (uptimes.reduce((sum, m) => sum + m.value, 0) / uptimes.length) * 100
          ).toFixed(1)}%`,
          sub: `24 h · ${uptimes.length} nodes`,
        };

  const monthEvents = repos.events
    .list()
    .filter((event) => event.openedAt >= monthAgoIso);
  const lead = leadTimeStats(monthEvents).p50;
  const leadTile: KpiTileData =
    lead.kind === "ok"
      ? {
          label: "Median lead time",
          value: `${Math.round(lead.value)}s`,
          sub: `30 d · ${lead.sampleSize} confirmed events`,
        }
      : { label: "Median lead time", ...INSUFFICIENT };

  const delivery = overallDeliveryRate(repos.alerts.listSince(monthAgoIso));
  const deliveryTile: KpiTileData =
    delivery.kind === "ok"
      ? {
          label: "Delivery success",
          value: `${(delivery.value * 100).toFixed(1)}%`,
          sub: `30 d · ${delivery.sampleSize} alerts`,
        }
      : { label: "Delivery success", ...INSUFFICIENT };

  const openEvents = repos.events.listOpen();
  const active = openEvents.filter(
    (event) => event.state === "confirmed" || event.state === "responding",
  ).length;
  const pending = openEvents.length - active;
  const openTile: KpiTileData = {
    label: "Open events",
    value: String(active),
    sub:
      pending === 0
        ? "confirmed incursions"
        : `+ ${pending} unconfirmed pending`,
  };

  return [uptimeTile, leadTile, deliveryTile, openTile];
}

function buildFeedSeed(
  repos: ReturnType<typeof getRuntimeRepositories>,
): FeedItem[] {
  const items: FeedItem[] = [];

  for (const signal of repos.signals.listRecent(15)) {
    items.push({
      kind: "signal",
      id: signal.id,
      at: signal.at,
      nodeId: signal.nodeId,
      source: signal.source,
      classification: signal.classification,
      confidence: signal.confidence,
      snapshotPath: signal.snapshotPath,
      eventId: signal.eventId,
    });
  }
  for (const event of repos.events.list().slice(-12)) {
    items.push({
      kind: "event",
      id: event.id,
      at: event.resolvedAt ?? event.confirmedAt ?? event.openedAt,
      nodeId: event.nodeId,
      state: event.state,
      speciesLabel: event.speciesLabel,
      openedAt: event.openedAt,
      confirmedAt: event.confirmedAt,
    });
  }
  for (const outage of repos.outages.listRecent(4)) {
    items.push({
      kind: "outage",
      id: outage.id,
      at: outage.endedAt ?? outage.startedAt,
      nodeId: outage.nodeId,
      startedAt: outage.startedAt,
      endedAt: outage.endedAt,
    });
  }

  return items;
}

function buildHealthSeed(
  repos: ReturnType<typeof getRuntimeRepositories>,
  nodes: ReturnType<ReturnType<typeof getRuntimeRepositories>["nodes"]["list"]>,
): {
  sparklines: Record<string, Array<number | null>>;
  openOutages: OpenOutageSeed[];
} {
  const nowMs = Date.now();
  const window = {
    from: new Date(nowMs - DAY_MS).toISOString(),
    to: new Date(nowMs).toISOString(),
    bucketMinutes: SPARKLINE_BUCKET_MINUTES,
  };
  const sparklines = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      bucketMeans(
        repos.heartbeats
          .listForNodeSince(node.id, window.from)
          .map((heartbeat) => ({
            at: heartbeat.at,
            value: heartbeat.linkQualityPct,
          })),
        window,
      ),
    ]),
  );
  const openOutages: OpenOutageSeed[] = [];
  for (const node of nodes) {
    const outage = repos.outages.findOpenForNode(node.id);
    if (outage !== null) {
      openOutages.push({
        id: outage.id,
        nodeId: outage.nodeId,
        startedAt: outage.startedAt,
      });
    }
  }
  return { sparklines, openOutages };
}

export default function CommandDashboardPage() {
  const repos = getRuntimeRepositories();
  const nodes = repos.nodes.list();
  const openEvents = repos.events.listOpen();
  const kpiTiles = computeKpiTiles(repos);
  const feedSeed = buildFeedSeed(repos);
  const nodeNames = Object.fromEntries(
    nodes.map((node) => [node.id, node.name]),
  );

  // Health board: 24h link-quality sparklines + open outages per node.
  const { sparklines, openOutages } = buildHealthSeed(repos, nodes);

  // Active cascades: confirmed/responding events with alerts + responses.
  const settings = repos.settings.get();
  const activeEvents = openEvents.filter(
    (event) => event.state === "confirmed" || event.state === "responding",
  );
  const cascadeEvents: CascadeEventSeed[] = activeEvents.map((event) => ({
    id: event.id,
    nodeId: event.nodeId,
    state: event.state,
    speciesLabel: event.speciesLabel,
    openedAt: event.openedAt,
    confirmedAt: event.confirmedAt,
  }));
  const cascadeAlerts: CascadeAlertSeed[] = activeEvents.flatMap((event) =>
    repos.alerts.listForEvent(event.id).map((alert) => ({
      id: alert.id,
      eventId: event.id,
      tier: alert.tier,
      channel: alert.channel,
      status: alert.status,
      queuedAt: alert.queuedAt,
      isLive: alert.isLive,
    })),
  );
  const cascadeResponses: CascadeResponseSeed[] = activeEvents.flatMap(
    (event) =>
      repos.responses.listForEvent(event.id).map((response) => ({
        id: response.id,
        eventId: event.id,
        responderId: response.responderId,
        action: response.action,
        at: response.at,
      })),
  );
  const responderNames = Object.fromEntries(
    repos.responders.list().map((responder) => [responder.id, responder.name]),
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Command dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Live field state for the Dooars corridor pilot — all times IST.
        </p>
      </header>

      <KpiStrip tiles={kpiTiles} />

      <div className="grid gap-6 xl:grid-cols-5">
        <section
          aria-label="Live network map"
          className="overflow-hidden rounded-lg border border-line bg-raised xl:col-span-3"
        >
          <div className="h-[46vh] min-h-80">
            <LiveMap
              nodes={nodes.map((node) => ({
                id: node.id,
                name: node.name,
                kind: node.kind,
                lat: node.lat,
                lng: node.lng,
                geofenceRadiusM: node.geofenceRadiusM,
                status: node.status,
                batteryPct: node.batteryPct,
                linkQualityPct: node.linkQualityPct,
                lastHeartbeatAt: node.lastHeartbeatAt,
              }))}
              activeEvents={openEvents
                .filter(
                  (event) =>
                    event.state === "confirmed" || event.state === "responding",
                )
                .map((event) => ({ id: event.id, nodeId: event.nodeId }))}
            />
          </div>
        </section>

        <section
          aria-labelledby="feed-heading"
          className="flex min-w-0 flex-col gap-3 xl:col-span-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="feed-heading" className="text-base font-medium">
              Live feed
            </h2>
            <Link
              href="/command/events"
              className="text-sm font-medium text-accent hover:text-accent-hover"
            >
              Events log →
            </Link>
          </div>
          <LiveFeed initialItems={feedSeed} nodeNames={nodeNames} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <HealthBoard
          initialNodes={nodes.map((node) => ({
            id: node.id,
            name: node.name,
            kind: node.kind,
            status: node.status,
            batteryPct: node.batteryPct,
            linkQualityPct: node.linkQualityPct,
            lastHeartbeatAt: node.lastHeartbeatAt,
          }))}
          sparklines={sparklines}
          initialOpenOutages={openOutages}
        />
        <ActiveCascades
          initialEvents={cascadeEvents}
          initialAlerts={cascadeAlerts}
          initialResponses={cascadeResponses}
          nodeNames={nodeNames}
          responderNames={responderNames}
          escalationTimeoutS={settings.escalationTimeoutS}
        />
      </div>
    </div>
  );
}
