import { handleDetectionPost, handleHeartbeatPost } from "@/ingest/api";

import type { DetectionPost, HeartbeatPost, SimulatorTransport } from "./simulator";

/**
 * In-process transport: builds real Requests and dispatches them to the
 * public ingest route handlers, so simulated devices exercise the exact
 * validation and pipeline external POSTs would — without a network hop or
 * port coupling.
 */

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://coexist.internal${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ensureAccepted(response: Response, label: string): Promise<void> {
  if (response.status === 202) return;
  let detail = `status ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    detail = body.error?.code ?? detail;
  } catch {
    // keep the status-based detail
  }
  throw new Error(`${label} ingest rejected: ${detail}`);
}

export function createIngestRouteTransport(): SimulatorTransport {
  return {
    async postHeartbeat(payload: HeartbeatPost): Promise<void> {
      const response = await handleHeartbeatPost(jsonRequest("/api/ingest/heartbeat", payload));
      await ensureAccepted(response, "heartbeat");
    },

    async postDetection(payload: DetectionPost): Promise<void> {
      const response = await handleDetectionPost(jsonRequest("/api/ingest/detection", payload));
      await ensureAccepted(response, "detection");
    },
  };
}
