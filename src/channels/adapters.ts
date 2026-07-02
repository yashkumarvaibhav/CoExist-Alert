import type { Alert, AlertChannel } from "@/domain/types";

export interface DeliveryResult {
  status: "delivered" | "failed";
  sentAt: string;
  deliveredAt: string | null;
  failedReason: string | null;
  isLive: boolean;
}

export interface ChannelAdapter {
  channel: AlertChannel;
  dispatch(alert: Alert): DeliveryResult;
}

interface SimulatedLatency {
  sendMs: number;
  deliverMs: number;
}

const SIMULATED_LATENCY: Record<AlertChannel, SimulatedLatency> = {
  siren: { sendMs: 250, deliverMs: 1_250 },
  villager_phone: { sendMs: 500, deliverMs: 2_000 },
  guard_webex: { sendMs: 650, deliverMs: 2_250 },
  control_room: { sendMs: 700, deliverMs: 2_500 },
  blindspot_ops: { sendMs: 200, deliverMs: 1_000 },
};

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

function simulatedAdapter(channel: AlertChannel): ChannelAdapter {
  return {
    channel,
    dispatch(alert) {
      const latency = SIMULATED_LATENCY[channel];
      const sentAt = addMilliseconds(alert.queuedAt, latency.sendMs);
      return {
        status: "delivered",
        sentAt,
        deliveredAt: addMilliseconds(sentAt, latency.deliverMs),
        failedReason: null,
        isLive: false,
      };
    },
  };
}

const adapters: Record<AlertChannel, ChannelAdapter> = {
  siren: simulatedAdapter("siren"),
  villager_phone: simulatedAdapter("villager_phone"),
  guard_webex: simulatedAdapter("guard_webex"),
  control_room: simulatedAdapter("control_room"),
  blindspot_ops: simulatedAdapter("blindspot_ops"),
};

export function adapterForChannel(channel: AlertChannel): ChannelAdapter {
  return adapters[channel];
}
