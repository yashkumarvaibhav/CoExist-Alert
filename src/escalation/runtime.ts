import { planCascade, planEscalation } from "@/domain/cascade";
import type { Alert, AlertTier, IncursionEvent } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";
import { dispatchPlannedTier } from "@/channels/dispatch";
import { publishStreamEvents } from "@/stream/hub";

type Repositories = ReturnType<typeof createRepositories>;
type TimerHandle = ReturnType<typeof setTimeout>;

interface ScheduledEscalation {
  dueAt: string;
  timer: TimerHandle;
}

interface EscalationRuntimeStore {
  timers: Map<string, ScheduledEscalation>;
}

const ESCALATION_KEY = Symbol.for("coexist-alert.escalation-runtime");
const globalStore = globalThis as unknown as Record<symbol, EscalationRuntimeStore | undefined>;

function store(): EscalationRuntimeStore {
  const existing = globalStore[ESCALATION_KEY];
  if (existing !== undefined) return existing;
  const next = { timers: new Map<string, ScheduledEscalation>() };
  globalStore[ESCALATION_KEY] = next;
  return next;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasAck(responses: ReturnType<Repositories["responses"]["listForEvent"]>): boolean {
  return responses.some((response) => response.action === "acknowledged");
}

function latestHighestTier(alerts: Alert[]): { tier: AlertTier; lastDispatchAt: string } | null {
  let latest: { tier: AlertTier; lastDispatchAt: string } | null = null;
  for (const alert of alerts) {
    if (latest === null) {
      latest = { tier: alert.tier, lastDispatchAt: alert.queuedAt };
      continue;
    }
    if (alert.tier > latest.tier) {
      latest = { tier: alert.tier, lastDispatchAt: alert.queuedAt };
      continue;
    }
    if (alert.tier === latest.tier && alert.queuedAt > latest.lastDispatchAt) {
      latest = { tier: alert.tier, lastDispatchAt: alert.queuedAt };
    }
  }
  return latest;
}

function eventCanEscalate(event: IncursionEvent | null): event is IncursionEvent {
  return event !== null && (event.state === "confirmed" || event.state === "responding");
}

function clearScheduled(eventId: string): void {
  const scheduled = store().timers.get(eventId);
  if (scheduled === undefined) return;
  clearTimeout(scheduled.timer);
  store().timers.delete(eventId);
}

export function cancelEscalationForEvent(eventId: string): void {
  clearScheduled(eventId);
}

export function scheduledEscalationDueAt(eventId: string): string | null {
  return store().timers.get(eventId)?.dueAt ?? null;
}

export function resetEscalationRuntime(): void {
  for (const scheduled of store().timers.values()) {
    clearTimeout(scheduled.timer);
  }
  store().timers.clear();
}

function escalationInputFor(
  repos: Repositories,
  eventId: string,
  at: string,
): Parameters<typeof planEscalation>[0] | null {
  const event = repos.events.findById(eventId);
  if (!eventCanEscalate(event)) return null;
  const highest = latestHighestTier(repos.alerts.listForEvent(event.id));
  if (highest === null) return null;

  return {
    lastDispatchAt: highest.lastDispatchAt,
    highestDispatchedTier: highest.tier,
    acknowledged: hasAck(repos.responses.listForEvent(event.id)),
    now: at,
    settings: repos.settings.get(),
  };
}

function planTierTargets(repos: Repositories, event: IncursionEvent, tier: AlertTier) {
  if (event.confirmedAt === null) return [];
  const node = repos.nodes.findById(event.nodeId);
  if (node === null) return [];
  return planCascade(
    {
      id: event.id,
      nodeId: event.nodeId,
      confirmedAt: event.confirmedAt,
      speciesLabel: event.speciesLabel,
    },
    node,
    repos.villagerZones.list(),
    repos.responders.list(),
  ).filter((target) => target.tier === tier);
}

async function fireEscalation(repos: Repositories, eventId: string): Promise<void> {
  clearScheduled(eventId);
  const at = nowIso();
  const input = escalationInputFor(repos, eventId, at);
  if (input === null) return;

  const decision = planEscalation(input);
  if (decision.kind === "stop") return;
  if (decision.kind === "wait") {
    scheduleEscalationForEvent(repos, eventId, at);
    return;
  }

  const event = repos.events.findById(eventId);
  if (!eventCanEscalate(event)) return;
  const targets = planTierTargets(repos, event, decision.toTier);
  if (targets.length === 0) return;

  const outcome = await dispatchPlannedTier(repos, event, targets, at);
  if (outcome.streamEvents.length > 0) {
    publishStreamEvents(outcome.streamEvents);
  }

  const highest = latestHighestTier(repos.alerts.listForEvent(event.id));
  if (highest !== null && highest.tier >= decision.toTier) {
    scheduleEscalationForEvent(repos, event.id, at);
  }
}

export function scheduleEscalationForEvent(
  repos: Repositories,
  eventId: string,
  at: string = nowIso(),
): void {
  clearScheduled(eventId);

  const input = escalationInputFor(repos, eventId, at);
  if (input === null) return;

  const decision = planEscalation(input);
  if (decision.kind === "stop") return;

  const dueAt =
    decision.kind === "wait"
      ? decision.nextCheckAt
      : at;
  const delayMs = Math.max(0, new Date(dueAt).getTime() - new Date(at).getTime());
  const timer = setTimeout(() => {
    void fireEscalation(repos, eventId);
  }, delayMs);
  timer.unref?.();

  store().timers.set(eventId, { dueAt, timer });
}

export function rebuildEscalationTimers(
  repos: Repositories,
  at: string = nowIso(),
): void {
  for (const event of repos.events.listOpen()) {
    if (event.state !== "confirmed" && event.state !== "responding") continue;
    scheduleEscalationForEvent(repos, event.id, at);
  }
}
