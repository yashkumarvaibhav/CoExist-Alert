import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { EventResponse, IncursionEvent } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";
import type { StreamEventDraft } from "@/stream/events";
import { cancelEscalationForEvent } from "@/escalation/runtime";

type Repositories = ReturnType<typeof createRepositories>;

export const eventResponsePayloadSchema = z
  .object({
    responderId: z.string().trim().min(1),
    action: z.enum(["acknowledged", "en_route", "on_site", "resolved"]),
  })
  .strict();

export type EventResponsePayload = z.infer<typeof eventResponsePayloadSchema>;

export class ResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResponseError";
  }
}

export interface EventResponseOutcome {
  response: EventResponse;
  event: IncursionEvent;
  streamEvents: StreamEventDraft[];
}

function makeId(): string {
  return `rsp_${randomUUID()}`;
}

function ensureRespondable(event: IncursionEvent): void {
  if (event.state === "confirmed" || event.state === "responding") return;
  throw new ResponseError(
    409,
    "event_not_open",
    "Only confirmed or responding events can record responder actions.",
  );
}

function nextEventState(
  event: IncursionEvent,
  action: EventResponsePayload["action"],
  at: string,
): IncursionEvent {
  if (action === "resolved") {
    return { ...event, state: "resolved", resolvedAt: at };
  }
  if (event.state === "confirmed") {
    return { ...event, state: "responding" };
  }
  return event;
}

export function recordEventResponse(
  repos: Repositories,
  eventId: string,
  payload: EventResponsePayload,
  at: string = new Date().toISOString(),
): EventResponseOutcome {
  const event = repos.events.findById(eventId);
  if (event === null) {
    throw new ResponseError(404, "event_not_found", "Event not found.");
  }
  ensureRespondable(event);

  const responder = repos.responders.findById(payload.responderId);
  if (responder === null) {
    throw new ResponseError(404, "responder_not_found", "Responder not found.");
  }

  const response = repos.responses.insert({
    id: makeId(),
    eventId: event.id,
    responderId: responder.id,
    action: payload.action,
    at,
  });
  const updatedEvent = repos.events.update(nextEventState(event, payload.action, at));

  if (payload.action === "acknowledged" || payload.action === "resolved") {
    cancelEscalationForEvent(event.id);
  }

  return {
    response,
    event: updatedEvent,
    streamEvents: [
      { type: "response", at, payload: response },
      { type: "event", at, payload: updatedEvent },
    ],
  };
}
