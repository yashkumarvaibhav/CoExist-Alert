"use client";

import { useCallback, useMemo, useState } from "react";

import { HonestyChip } from "@/components/honesty-chip";
import { NodeKindIcon } from "@/components/node-kind-icon";
import type { NodeKind, SignalSource } from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { SOURCES_BY_KIND, type ScenarioPreset } from "@/sim/scenarios";
import { formatIstTime } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Demo control panel — S9. Drives the simulated field through the same demo
 * scenario API and real ingest pipeline the automated tests use. Function
 * over polish, but on-identity; every action lands in the scenario log along
 * with the field's live reactions.
 */

export interface DemoNodeSeed {
  id: string;
  name: string;
  kind: NodeKind;
}

interface LogEntry {
  id: string;
  at: string;
  text: string;
  tone: "action" | "field" | "error";
}

const PRESETS: Array<{ preset: ScenarioPreset; label: string; hint: string }> = [
  {
    preset: "rail_crossing_confirmed",
    label: "Rail crossing confirmed",
    hint: "Camera sighting + thermal corroboration at KM-47 — full cascade.",
  },
  {
    preset: "village_dawn_incursion",
    label: "Village dawn incursion",
    hint: "Camera + motion at the village boundary — geofenced villager alerts.",
  },
  {
    preset: "weak_signal_expires",
    label: "Weak signal expires",
    hint: "One low-confidence signal, then silence — suppression made visible.",
  },
  {
    preset: "node_blindspot",
    label: "Node blind spot",
    hint: "Kill Waterhole 7's link; the sweep flags the corridor blind, then restore.",
  },
];

const CLASSIFICATIONS = ["movement", "large_animal", "elephant_class"] as const;

/** Camera/thermal detections reference a stylised demo snapshot; other sources send none. */
const SNAPSHOTS_BY_KIND: Record<NodeKind, Partial<Record<SignalSource, string>>> = {
  village_boundary: { camera: "/demo-snapshots/n1-dawn-boundary.svg" },
  rail_crossing: {
    camera: "/demo-snapshots/n2-camera.svg",
    thermal: "/demo-snapshots/n2-thermal.svg",
  },
  waterhole: { camera: "/demo-snapshots/n3-waterhole.svg" },
};

const LOG_CAP = 30;
const DEMO_STREAM_TYPES: readonly StreamEventType[] = ["event", "outage"];

function prettyLabel(speciesLabel: string | null): string {
  if (speciesLabel === null) return "Large animal";
  const dashed = speciesLabel.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

export function DemoPanel({
  nodes,
  initialAmbient,
  initialKilledNodeIds,
  confirmConfidence,
}: {
  nodes: DemoNodeSeed[];
  initialAmbient: boolean;
  initialKilledNodeIds: string[];
  confirmConfidence: number;
}) {
  const [ambient, setAmbient] = useState(initialAmbient);
  const [killed, setKilled] = useState<ReadonlySet<string>>(
    () => new Set(initialKilledNodeIds),
  );
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [manualNodeId, setManualNodeId] = useState(nodes[0]?.id ?? "");
  const [manualSource, setManualSource] = useState<SignalSource>("camera");
  const [manualClassification, setManualClassification] = useState<
    (typeof CLASSIFICATIONS)[number]
  >("large_animal");
  const [manualConfidence, setManualConfidence] = useState(0.62);

  const nodeNames = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.name])),
    [nodes],
  );
  const manualNode = nodes.find((node) => node.id === manualNodeId) ?? null;
  const manualSources: readonly SignalSource[] =
    manualNode !== null ? SOURCES_BY_KIND[manualNode.kind] : ["camera"];
  const effectiveSource: SignalSource = manualSources.includes(manualSource)
    ? manualSource
    : manualSources[0];

  const appendLog = useCallback((text: string, tone: LogEntry["tone"]) => {
    setLog((current) =>
      [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          text,
          tone,
        },
        ...current,
      ].slice(0, LOG_CAP),
    );
  }, []);

  const onStreamEvent = useCallback(
    (streamEvent: FieldStreamEvent) => {
      if (streamEvent.type === "event") {
        const e = streamEvent.payload;
        const node = nodeNames.get(e.nodeId) ?? e.nodeId;
        if (e.state === "confirmed") {
          appendLog(
            `${prettyLabel(e.speciesLabel)} confirmed at ${node} — cascade dispatched.`,
            "field",
          );
        } else if (e.state === "expired") {
          appendLog(`Signal at ${node} expired — alert suppressed.`, "field");
        } else if (e.state === "resolved") {
          appendLog(`Event at ${node} resolved.`, "field");
        }
        return;
      }
      if (streamEvent.type === "outage") {
        const o = streamEvent.payload;
        const node = nodeNames.get(o.nodeId) ?? o.nodeId;
        appendLog(
          o.endedAt === null
            ? `Blind spot opened at ${node} — ops alerted.`
            : `Coverage restored at ${node}.`,
          "field",
        );
      }
    },
    [appendLog, nodeNames],
  );

  useLiveStream({ types: DEMO_STREAM_TYPES, onEvent: onStreamEvent });

  const postScenario = useCallback(
    async (
      body: Record<string, unknown>,
      describe: (result: Record<string, unknown>) => string,
    ) => {
      setPending(true);
      try {
        const res = await fetch("/api/demo/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          const error = json.error as { message?: string } | undefined;
          appendLog(error?.message ?? "Scenario request failed.", "error");
          return;
        }
        const state = json.state as
          | { ambient: boolean; killedNodeIds: string[] }
          | undefined;
        if (state !== undefined) {
          setAmbient(state.ambient);
          setKilled(new Set(state.killedNodeIds));
        }
        appendLog(describe(json), "action");
      } catch {
        appendLog("Scenario request failed — network error.", "error");
      } finally {
        setPending(false);
      }
    },
    [appendLog],
  );

  async function sendManualDetection(): Promise<void> {
    if (manualNode === null) return;
    setPending(true);
    try {
      const res = await fetch("/api/ingest/detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: manualNode.id,
          at: new Date().toISOString(),
          source: effectiveSource,
          classification: manualClassification,
          confidence: manualConfidence,
          snapshotRef: SNAPSHOTS_BY_KIND[manualNode.kind][effectiveSource] ?? null,
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const error = json.error as { message?: string } | undefined;
        appendLog(error?.message ?? "Detection was rejected.", "error");
        return;
      }
      appendLog(
        `Sent ${effectiveSource} detection (${Math.round(manualConfidence * 100)}%) to ${manualNode.name} — event ${String(json.eventState)}.`,
        "action",
      );
    } catch {
      appendLog("Detection failed — network error.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p
        role="note"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-status-degraded/40 px-4 py-3 text-sm font-medium text-status-degraded"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v4.5M12 17.5v.1" />
        </svg>
        DEMO CONTROLS — drives the simulated field
        <HonestyChip mode="simulated" />
      </p>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
      <section
        aria-labelledby="presets-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="presets-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Scenario presets
        </h2>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {PRESETS.map(({ preset, label, hint }) => (
            <button
              key={preset}
              type="button"
              disabled={pending}
              onClick={() =>
                postScenario(
                  { action: "trigger_detection", preset },
                  (json) => {
                    const scheduled = json.scheduled as
                      | { nodeId?: string }
                      | undefined;
                    const node =
                      scheduled?.nodeId !== undefined
                        ? (nodeNames.get(scheduled.nodeId) ?? scheduled.nodeId)
                        : "the field";
                    return `Preset "${label}" started on ${node}.`;
                  },
                )
              }
              className="min-h-11 rounded-md border border-line px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60"
            >
              <span className="block text-sm font-medium text-accent">
                {label}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="manual-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="manual-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Manual trigger
        </h2>
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Node
              <select
                value={manualNodeId}
                onChange={(event) => setManualNodeId(event.target.value)}
                className="min-h-11 rounded-md border border-line bg-page px-2 text-sm text-ink"
              >
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Source
              <select
                value={effectiveSource}
                onChange={(event) =>
                  setManualSource(event.target.value as SignalSource)
                }
                className="min-h-11 rounded-md border border-line bg-page px-2 text-sm text-ink"
              >
                {manualSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Classification
              <select
                value={manualClassification}
                onChange={(event) =>
                  setManualClassification(
                    event.target.value as (typeof CLASSIFICATIONS)[number],
                  )
                }
                className="min-h-11 rounded-md border border-line bg-page px-2 text-sm text-ink"
              >
                {CLASSIFICATIONS.map((classification) => (
                  <option key={classification} value={classification}>
                    {classification}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            <span>
              Confidence:{" "}
              <output className="tnum text-sm text-ink">
                {Math.round(manualConfidence * 100)}%
              </output>{" "}
              <span className="font-normal">
                (≥ {Math.round(confirmConfidence * 100)}% confirms without
                corroboration)
              </span>
            </span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.01}
              value={manualConfidence}
              onChange={(event) =>
                setManualConfidence(Number(event.target.value))
              }
              style={{ accentColor: "var(--accent)" }}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={sendManualDetection}
              className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-60"
            >
              Send detection
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                postScenario(
                  { action: "second_signal", nodeId: manualNodeId },
                  (json) => {
                    const sent = json.sent as { source?: string } | undefined;
                    return `Corroborating ${sent?.source ?? "signal"} sent to ${
                      manualNode?.name ?? manualNodeId
                    }.`;
                  },
                )
              }
              className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-accent hover:bg-hover disabled:opacity-60"
            >
              Send corroborating signal
            </button>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="links-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="links-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Node links
        </h2>
        <ul className="divide-y divide-line">
          {nodes.map((node) => {
            const isKilled = killed.has(node.id);
            return (
              <li
                key={node.id}
                data-demo-node-id={node.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <NodeKindIcon
                  kind={node.kind}
                  className="size-5 shrink-0 text-muted"
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                  {node.name}
                </span>
                {isKilled && (
                  <span className="text-xs font-medium uppercase tracking-[0.08em] text-status-offline">
                    link killed
                  </span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    postScenario(
                      {
                        action: isKilled ? "restore_link" : "kill_link",
                        nodeId: node.id,
                      },
                      () =>
                        isKilled
                          ? `Link restored on ${node.name}.`
                          : `Link killed on ${node.name} — heartbeats stop now.`,
                    )
                  }
                  className="min-h-11 rounded-md border border-line px-3 text-sm font-medium text-accent hover:bg-hover disabled:opacity-60"
                >
                  {isKilled ? "Restore link" : "Kill link"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
      <section
        aria-labelledby="world-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="world-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Field controls
        </h2>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-body">
              Ambient chatter{" "}
              <span className="block text-xs text-faint">
                Occasional low-confidence signals while the field is quiet.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={ambient}
              disabled={pending}
              onClick={() =>
                postScenario(
                  { action: "set_ambient", enabled: !ambient },
                  () =>
                    ambient
                      ? "Ambient chatter switched off."
                      : "Ambient chatter switched on.",
                )
              }
              className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
                ambient ? "border-accent bg-accent" : "border-line bg-sidebar"
              }`}
            >
              <span className="sr-only">Ambient chatter</span>
              <span
                aria-hidden="true"
                className={`absolute top-0.5 size-5.5 rounded-full border border-line bg-white transition-all ${
                  ambient ? "left-6" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {confirmingReset ? (
              <>
                <span className="text-sm text-body">
                  Settle all open events and restore every link?
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setConfirmingReset(false);
                    postScenario({ action: "reset_world" }, (json) => {
                      const settled = json.settled as
                        | { resolved?: number; expired?: number }
                        | undefined;
                      return `World reset — ${settled?.resolved ?? 0} resolved, ${settled?.expired ?? 0} expired.`;
                    });
                  }}
                  className="min-h-11 rounded-md bg-status-offline px-4 text-sm font-medium text-page hover:opacity-90 disabled:opacity-60"
                >
                  Yes, reset world
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-body hover:bg-hover"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-body">
                  Reset world{" "}
                  <span className="block text-xs text-faint">
                    Settles open events, restores links, releases the scenario
                    slot.
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmingReset(true)}
                  className="min-h-11 rounded-md border border-status-offline/40 px-4 text-sm font-medium text-status-offline hover:bg-hover disabled:opacity-60"
                >
                  Reset world…
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="log-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="log-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Scenario log
        </h2>
        {log.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No actions yet — trigger a preset to start the story.
          </p>
        ) : (
          <ol aria-live="polite" className="divide-y divide-line">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline gap-3 px-4 py-2 text-sm"
              >
                <span className="tnum shrink-0 text-xs text-faint">
                  {formatIstTime(entry.at)}
                </span>
                <span
                  className={
                    entry.tone === "error"
                      ? "font-medium text-status-offline"
                      : entry.tone === "field"
                        ? "text-body"
                        : "text-muted"
                  }
                >
                  {entry.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      </div>
      </div>
    </div>
  );
}
