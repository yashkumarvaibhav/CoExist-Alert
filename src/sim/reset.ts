import type { createRepositories } from "@/db/repositories";
import { cancelEscalationForEvent } from "@/escalation/runtime";
import type { StreamEventDraft } from "@/stream/events";

type Repositories = ReturnType<typeof createRepositories>;

export interface WorldResetOutcome {
  settled: { resolved: number; expired: number };
  streamEvents: StreamEventDraft[];
}

/**
 * Demo-panel world reset: settle every open event (unconfirmed → expired,
 * confirmed/responding → resolved) without fabricating responder actions, so
 * response-time metrics stay honest. Escalation timers are cancelled and each
 * settled event is published so live views drop their cards.
 */
export function resetWorldEvents(
  repos: Repositories,
  at: string = new Date().toISOString(),
): WorldResetOutcome {
  const streamEvents: StreamEventDraft[] = [];
  let resolved = 0;
  let expired = 0;

  for (const event of repos.events.listOpen()) {
    const settled =
      event.state === "unconfirmed"
        ? { ...event, state: "expired" as const }
        : { ...event, state: "resolved" as const, resolvedAt: at };
    if (settled.state === "expired") expired += 1;
    else resolved += 1;

    const updated = repos.events.update(settled);
    cancelEscalationForEvent(event.id);
    streamEvents.push({ type: "event", at, payload: updated });
  }

  return { settled: { resolved, expired }, streamEvents };
}
