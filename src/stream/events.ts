import type {
  Alert,
  EventResponse,
  IncursionEvent,
  Outage,
  SensorNode,
  Signal,
} from "@/domain/types";

export const STREAM_EVENT_TYPES = [
  "node-status",
  "signal",
  "event",
  "alert",
  "delivery",
  "response",
  "outage",
  "kpi",
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface NodeStatusPayload {
  nodeId: string;
  status: SensorNode["status"];
  batteryPct: number | null;
  linkQualityPct: number | null;
  lastHeartbeatAt: string | null;
}

export interface KpiPayload {
  key: string;
  value: number | string | null;
  status: "ok" | "insufficient";
}

export type FieldStreamEvent =
  | {
      id: string;
      type: "node-status";
      at: string;
      payload: NodeStatusPayload;
    }
  | { id: string; type: "signal"; at: string; payload: Signal }
  | { id: string; type: "event"; at: string; payload: IncursionEvent }
  | { id: string; type: "alert"; at: string; payload: Alert }
  | { id: string; type: "delivery"; at: string; payload: Alert }
  | { id: string; type: "response"; at: string; payload: EventResponse }
  | { id: string; type: "outage"; at: string; payload: Outage }
  | { id: string; type: "kpi"; at: string; payload: KpiPayload };

export type StreamEventDraft = Omit<FieldStreamEvent, "id">;
