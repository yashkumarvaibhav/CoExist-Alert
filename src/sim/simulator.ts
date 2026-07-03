import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  IncursionEvent,
  SensorNode,
  Settings,
  Signal,
  SignalSource,
} from "@/domain/types";

import { SimulatorError } from "./errors";
import { createSeededRandom } from "./random";
import {
  SOURCES_BY_KIND,
  planScenario,
  resolveScenarioNode,
  type ScenarioPreset,
  type ScenarioStep,
} from "./scenarios";

/**
 * Field simulator: stands in for the (honestly labelled SIMULATED) sensor
 * nodes. It never touches the database directly — every heartbeat and
 * detection goes through the same ingest API a real edge device would call.
 */

export interface HeartbeatPost {
  nodeId: string;
  at: string;
  batteryPct: number;
  linkQualityPct: number;
}

export interface DetectionPost {
  nodeId: string;
  at: string;
  source: SignalSource;
  classification: string;
  confidence: number;
  snapshotRef: string | null;
}

export interface SimulatorTransport {
  postHeartbeat(payload: HeartbeatPost): Promise<void>;
  postDetection(payload: DetectionPost): Promise<void>;
}

export interface SimulatorFieldReader {
  listNodes(): SensorNode[];
  getSettings(): Settings;
  listOpenEvents(): IncursionEvent[];
  findSignalById(id: string): Signal | null;
}

export interface SimulatorOptions {
  reader: SimulatorFieldReader;
  transport: SimulatorTransport;
  now?: () => Date;
  seed?: number;
  ambient?: boolean;
}

export interface SimulatorStatus {
  running: boolean;
  ambient: boolean;
  killedNodeIds: string[];
  scenario: ScenarioPreset | null;
  lastError: string | null;
}

export interface ScheduledScenario {
  preset: ScenarioPreset;
  nodeId: string;
  steps: number;
}

export interface SecondSignalResult {
  eventId: string;
  nodeId: string;
  source: SignalSource;
}

const DEFAULT_SEED = 20260713; // submission day — any fixed value works
const AMBIENT_SIGNAL_PROBABILITY = 0.15;
const AMBIENT_MIN_CONFIDENCE = 0.22;
const AMBIENT_CONFIDENCE_SPREAD = 0.2;
const BATTERY_DRAIN_PROBABILITY = 0.04;
/** Kept above LOW_BATTERY_PCT so jitter alone never degrades a node. */
const BATTERY_FLOOR_PCT = 25;
const LINK_JITTER_RANGE = 3;
const SECOND_SIGNAL_CONFIDENCE = 0.72;

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export class FieldSimulator {
  private readonly reader: SimulatorFieldReader;
  private readonly transport: SimulatorTransport;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly initialAmbient: boolean;

  private ambient: boolean;
  private killed = new Set<string>();
  private batteryByNode = new Map<string, number>();
  /** First-seen link quality per node: jitter hovers here instead of random-walking. */
  private linkBaseByNode = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private scenarioTimers: Array<ReturnType<typeof setTimeout>> = [];
  private activeScenario: ScenarioPreset | null = null;
  private pendingSteps = 0;
  /** Serializes scenario steps so a corroboration can never race its lead. */
  private stepChain: Promise<void> = Promise.resolve();
  private ticking = false;
  private lastError: string | null = null;

  constructor(options: SimulatorOptions) {
    this.reader = options.reader;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
    this.random = createSeededRandom(options.seed ?? DEFAULT_SEED);
    this.initialAmbient = options.ambient ?? false;
    this.ambient = this.initialAmbient;
  }

  start(): void {
    if (this.loop !== null) return;
    const settings = this.safeSettings();
    this.loop = setInterval(() => {
      void this.tick();
    }, settings.heartbeatIntervalS * 1000);
    this.loop.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.loop !== null) {
      clearInterval(this.loop);
      this.loop = null;
    }
    this.cancelScenario();
  }

  killLink(nodeId: string): void {
    this.requireNode(nodeId);
    this.killed.add(nodeId);
  }

  /** Demo-panel toggle; `reset()` returns ambient to its boot-time value. */
  setAmbient(enabled: boolean): void {
    this.ambient = enabled;
  }

  restoreLink(nodeId: string): void {
    this.requireNode(nodeId);
    this.killed.delete(nodeId);
  }

  runScenario(preset: ScenarioPreset, nodeId?: string): ScheduledScenario {
    const node = resolveScenarioNode(preset, this.reader.listNodes(), nodeId);
    this.cancelScenario();

    const steps = planScenario(preset);
    this.activeScenario = preset;
    this.pendingSteps = steps.length;
    for (const step of steps) {
      const timer = setTimeout(() => {
        this.stepChain = this.stepChain.then(() => this.executeStep(node.id, step));
      }, step.delayS * 1000);
      timer.unref?.();
      this.scenarioTimers.push(timer);
    }
    return { preset, nodeId: node.id, steps: steps.length };
  }

  async sendSecondSignal(nodeId?: string): Promise<SecondSignalResult> {
    const open = this.reader
      .listOpenEvents()
      .filter(
        (event) =>
          event.state === "unconfirmed" &&
          (nodeId === undefined || event.nodeId === nodeId),
      );
    const event = open.at(-1);
    if (event === undefined) {
      throw new SimulatorError(
        409,
        "no_open_event",
        "No open unconfirmed event to corroborate.",
      );
    }

    const leadSource = this.reader.findSignalById(event.leadSignalId)?.source;
    const node = this.reader.listNodes().find((candidate) => candidate.id === event.nodeId);
    const kit = SOURCES_BY_KIND[node?.kind ?? "village_boundary"];
    const source = kit.find((candidate) => candidate !== leadSource) ?? kit[0];

    await this.transport.postDetection({
      nodeId: event.nodeId,
      at: this.now().toISOString(),
      source,
      classification: "elephant_class",
      confidence: SECOND_SIGNAL_CONFIDENCE,
      snapshotRef: null,
    });
    return { eventId: event.id, nodeId: event.nodeId, source };
  }

  reset(): void {
    this.cancelScenario();
    this.killed.clear();
    this.ambient = this.initialAmbient;
    this.lastError = null;
  }

  status(): SimulatorStatus {
    return {
      running: this.loop !== null,
      ambient: this.ambient,
      killedNodeIds: [...this.killed].sort(),
      scenario: this.activeScenario,
      lastError: this.lastError,
    };
  }

  private requireNode(nodeId: string): void {
    const exists = this.reader.listNodes().some((node) => node.id === nodeId);
    if (!exists) {
      throw new SimulatorError(404, "node_not_found", `Unknown sensor node "${nodeId}".`);
    }
  }

  private safeSettings(): Settings {
    try {
      return this.reader.getSettings();
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const nodes = this.reader.listNodes();
      for (const node of nodes) {
        if (this.killed.has(node.id)) continue;
        await this.transport.postHeartbeat({
          nodeId: node.id,
          at: this.now().toISOString(),
          batteryPct: this.nextBattery(node),
          linkQualityPct: this.nextLinkQuality(node),
        });
      }
      await this.maybeAmbientSignal(nodes);
      this.lastError = null;
    } catch (error) {
      this.noteError(error);
    } finally {
      this.ticking = false;
    }
  }

  private nextBattery(node: SensorNode): number {
    const current = this.batteryByNode.get(node.id) ?? node.batteryPct ?? 92;
    const drained =
      this.random() < BATTERY_DRAIN_PROBABILITY
        ? Math.max(BATTERY_FLOOR_PCT, current - 1)
        : current;
    this.batteryByNode.set(node.id, drained);
    return clampPct(drained);
  }

  private nextLinkQuality(node: SensorNode): number {
    let base = this.linkBaseByNode.get(node.id);
    if (base === undefined) {
      base = node.linkQualityPct ?? 90;
      this.linkBaseByNode.set(node.id, base);
    }
    const jitter =
      Math.floor(this.random() * (2 * LINK_JITTER_RANGE + 1)) - LINK_JITTER_RANGE;
    return clampPct(base + jitter);
  }

  /**
   * Ambient mode: occasional low-confidence chatter that expires unconfirmed,
   * making suppression visible. Held back while any event is open so it can
   * never corroborate a scripted scenario by accident.
   */
  private async maybeAmbientSignal(nodes: SensorNode[]): Promise<void> {
    if (!this.ambient) return;
    if (this.random() >= AMBIENT_SIGNAL_PROBABILITY) return;
    const alive = nodes.filter((node) => !this.killed.has(node.id));
    if (alive.length === 0) return;
    if (this.reader.listOpenEvents().length > 0) return;

    const node = alive[Math.floor(this.random() * alive.length)];
    const kit = SOURCES_BY_KIND[node.kind];
    const source = kit[Math.floor(this.random() * kit.length)];
    const confidence =
      Math.round(
        (AMBIENT_MIN_CONFIDENCE + this.random() * AMBIENT_CONFIDENCE_SPREAD) * 100,
      ) / 100;

    await this.transport.postDetection({
      nodeId: node.id,
      at: this.now().toISOString(),
      source,
      classification: "movement",
      confidence,
      snapshotRef: null,
    });
  }

  private async executeStep(nodeId: string, step: ScenarioStep): Promise<void> {
    try {
      if (step.kind === "detection") {
        await this.transport.postDetection({
          nodeId,
          at: this.now().toISOString(),
          source: step.source,
          classification: step.classification,
          confidence: step.confidence,
          snapshotRef: step.snapshotRef,
        });
      } else if (step.kind === "kill_link") {
        this.killed.add(nodeId);
      } else {
        this.killed.delete(nodeId);
      }
    } catch (error) {
      this.noteError(error);
    } finally {
      this.pendingSteps -= 1;
      if (this.pendingSteps <= 0) {
        this.activeScenario = null;
        this.scenarioTimers = [];
        this.pendingSteps = 0;
      }
    }
  }

  private cancelScenario(): void {
    for (const timer of this.scenarioTimers) {
      clearTimeout(timer);
    }
    this.scenarioTimers = [];
    this.activeScenario = null;
    this.pendingSteps = 0;
  }

  private noteError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== this.lastError) {
      console.warn(`[simulator] ${message}`);
    }
    this.lastError = message;
  }
}
