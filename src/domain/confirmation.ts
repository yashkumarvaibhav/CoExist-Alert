import type { Settings, SignalSource } from "./types";

/**
 * Event confirmation engine — false-positive suppression, pure decisions.
 *
 * Rules (ARCHITECTURE §3): a signal at or above `confirmConfidence` confirms
 * immediately. Otherwise the event opens `unconfirmed`, and a second signal
 * from a DIFFERENT source within `confirmationWindowS` of the event opening
 * confirms it. Same-source signals attach as evidence without confirming and
 * never restart the window. Past the window an unconfirmed event expires —
 * logged, never alerted.
 */

export type ConfirmationSettings = Pick<
  Settings,
  "confirmationWindowS" | "confirmConfidence"
>;

/** The open (unexpired, unresolved) event at a node, if any. */
export interface PendingEvent {
  eventId: string;
  nodeId: string;
  openedAt: string;
  state: "unconfirmed" | "confirmed" | "responding";
  leadSource: SignalSource;
  leadClassification: string;
  leadConfidence: number;
}

export interface SignalInput {
  id: string;
  nodeId: string;
  at: string;
  source: SignalSource;
  classification: string;
  confidence: number;
}

export type ConfirmationDecision =
  /** No live event to join: create one, with this signal as the lead. */
  | { kind: "open"; state: "unconfirmed" }
  | { kind: "open"; state: "confirmed"; speciesLabel: string }
  /** Confirm the open event; this signal becomes the confirm signal. */
  | { kind: "confirm"; eventId: string; speciesLabel: string }
  /** Evidence only — attach the signal, change nothing else. */
  | { kind: "attach"; eventId: string };

export interface SignalOutcome {
  /** Stale unconfirmed event to expire before acting on the decision. */
  expireEventId: string | null;
  decision: ConfirmationDecision;
}

function withinWindow(
  openedAt: string,
  at: string,
  settings: ConfirmationSettings,
): boolean {
  const elapsedMs = new Date(at).getTime() - new Date(openedAt).getTime();
  return elapsedMs <= settings.confirmationWindowS * 1000;
}

export function processSignal(
  openEvent: PendingEvent | null,
  signal: SignalInput,
  settings: ConfirmationSettings,
): SignalOutcome {
  const highConfidence = signal.confidence >= settings.confirmConfidence;

  if (openEvent === null) {
    return {
      expireEventId: null,
      decision: highConfidence
        ? { kind: "open", state: "confirmed", speciesLabel: signal.classification }
        : { kind: "open", state: "unconfirmed" },
    };
  }

  // An already-confirmed incursion absorbs further signals as evidence:
  // one event, one cascade.
  if (openEvent.state !== "unconfirmed") {
    return {
      expireEventId: null,
      decision: { kind: "attach", eventId: openEvent.eventId },
    };
  }

  if (!withinWindow(openEvent.openedAt, signal.at, settings)) {
    // The open event is stale: expire it, then treat this signal as new.
    const fresh = processSignal(null, signal, settings);
    return { expireEventId: openEvent.eventId, decision: fresh.decision };
  }

  if (highConfidence || signal.source !== openEvent.leadSource) {
    return {
      expireEventId: null,
      decision: {
        kind: "confirm",
        eventId: openEvent.eventId,
        speciesLabel: signal.classification,
      },
    };
  }

  return {
    expireEventId: null,
    decision: { kind: "attach", eventId: openEvent.eventId },
  };
}

/** Sweep check: should this event expire now? Only unconfirmed events expire. */
export function evaluateExpiry(
  event: PendingEvent,
  nowIso: string,
  settings: ConfirmationSettings,
): boolean {
  if (event.state !== "unconfirmed") return false;
  return !withinWindow(event.openedAt, nowIso, settings);
}
