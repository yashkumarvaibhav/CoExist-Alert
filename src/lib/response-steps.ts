import type { ResponseAction } from "@/domain/types";

/**
 * Guard response stepper derivation — pure view of an event's response rows.
 * The response API accepts actions in any order (a resolve can arrive without
 * an en-route); the stepper always advances from the furthest completed step
 * and keeps the first timestamp per action as the recorded response time.
 */

export const RESPONSE_STEPS = [
  "acknowledged",
  "en_route",
  "on_site",
  "resolved",
] as const satisfies readonly ResponseAction[];

export interface ResponseProgress {
  /** First recorded timestamp per completed action. */
  completedAt: Partial<Record<ResponseAction, string>>;
  /** The step the responder takes next; null once resolved. */
  nextAction: ResponseAction | null;
  done: boolean;
}

export function deriveResponseProgress(
  responses: ReadonlyArray<{ action: ResponseAction; at: string }>,
): ResponseProgress {
  const completedAt: Partial<Record<ResponseAction, string>> = {};
  for (const response of responses) {
    const existing = completedAt[response.action];
    if (existing === undefined || response.at < existing) {
      completedAt[response.action] = response.at;
    }
  }

  let furthest = -1;
  for (let i = 0; i < RESPONSE_STEPS.length; i += 1) {
    if (completedAt[RESPONSE_STEPS[i]] !== undefined) furthest = i;
  }

  const done = furthest === RESPONSE_STEPS.length - 1;
  return {
    completedAt,
    nextAction: done ? null : RESPONSE_STEPS[furthest + 1],
    done,
  };
}
