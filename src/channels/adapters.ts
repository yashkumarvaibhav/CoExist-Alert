import type {
  Alert,
  AlertChannel,
  IncursionEvent,
  Responder,
  SensorNode,
  Signal,
} from "@/domain/types";

export interface DeliveryResult {
  status: "delivered" | "failed";
  sentAt: string;
  deliveredAt: string | null;
  failedReason: string | null;
  isLive: boolean;
}

export interface DeliveryContext {
  event: IncursionEvent | null;
  node: SensorNode | null;
  responder: Responder | null;
  signals: Signal[];
}

export interface ChannelAdapter {
  channel: AlertChannel;
  dispatch(alert: Alert, context: DeliveryContext): DeliveryResult | Promise<DeliveryResult>;
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

const WEBEX_MESSAGES_URL = "https://webexapis.com/v1/messages";
const DEFAULT_PUBLIC_URL = "https://coexist.yashkumarvaibhav.me";

function nowIso(): string {
  return new Date().toISOString();
}

function publicBaseUrl(): string {
  return (process.env.COEXIST_PUBLIC_URL ?? DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
}

function mapUrl(node: SensorNode | null): string {
  if (node === null) return `${publicBaseUrl()}/guard`;
  return `https://www.google.com/maps/search/?api=1&query=${node.lat},${node.lng}`;
}

function guardUrl(event: IncursionEvent | null): string {
  const path = event === null ? "/guard" : `/guard?eventId=${encodeURIComponent(event.id)}`;
  return `${publicBaseUrl()}${path}`;
}

function latestSnapshot(signals: Signal[]): string {
  return [...signals]
    .reverse()
    .find((signal) => signal.snapshotPath !== null)?.snapshotPath ?? "not attached";
}

function titleFor(context: DeliveryContext): string {
  const species = context.event?.speciesLabel ?? "large animal";
  const nodeName = context.node?.name ?? "field node";
  return `${species} confirmed near ${nodeName}`;
}

function formatConfidence(signals: Signal[]): string {
  const latest = [...signals].reverse().find((signal) => signal.confidence !== null);
  return latest === undefined ? "not reported" : `${Math.round(latest.confidence * 100)}%`;
}

function webexMessageBody(context: DeliveryContext, roomId: string) {
  const title = titleFor(context);
  const nodeName = context.node?.name ?? "Unknown node";
  const openedAt = context.event?.openedAt ?? "unknown";
  const confirmedAt = context.event?.confirmedAt ?? "unknown";
  const snapshot = latestSnapshot(context.signals);
  const responderName = context.responder?.name ?? "assigned guard";
  const map = mapUrl(context.node);
  const guard = guardUrl(context.event);

  return {
    roomId,
    markdown: `**CoExist Alert:** ${title}\n\nResponder: ${responderName}  \nNode: ${nodeName}  \nSnapshot: ${snapshot}  \n[Open map](${map}) · [Open guard view](${guard})`,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.3",
          body: [
            {
              type: "TextBlock",
              text: "CoExist Alert",
              weight: "bolder",
              size: "medium",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: title,
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Node", value: nodeName },
                { title: "Responder", value: responderName },
                { title: "Opened", value: openedAt },
                { title: "Confirmed", value: confirmedAt },
                { title: "Confidence", value: formatConfidence(context.signals) },
                { title: "Snapshot", value: snapshot },
              ],
            },
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Open map", url: map },
            { type: "Action.OpenUrl", title: "Open guard view", url: guard },
          ],
        },
      },
    ],
  };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    const message = body.message ?? body.error;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  } catch {
    // fall through to status text
  }
  return response.statusText || "request failed";
}

function cleanFailureReason(reason: string, token: string): string {
  return reason.replaceAll(token, "[redacted]").slice(0, 240);
}

/**
 * Maps an event to the id of its root Webex alert message so responder status
 * updates post as threaded replies under the original alert card. In-memory
 * and best-effort: a restart between the alert and the acknowledge just falls
 * back to a top-level status message.
 */
const webexThreadRoots = new Map<string, string>();

function rememberThreadRoot(eventId: string | null, messageId: unknown): void {
  if (eventId === null || typeof messageId !== "string") return;
  if (!webexThreadRoots.has(eventId)) webexThreadRoots.set(eventId, messageId);
}

function webexAdapter(): ChannelAdapter {
  const fallback = simulatedAdapter("guard_webex");
  return {
    channel: "guard_webex",
    async dispatch(alert, context) {
      const token = process.env.WEBEX_BOT_TOKEN;
      const roomId = process.env.WEBEX_ROOM_ID;
      if (token === undefined || token === "" || roomId === undefined || roomId === "") {
        return fallback.dispatch(alert, context);
      }

      const sentAt = nowIso();
      try {
        const response = await fetch(WEBEX_MESSAGES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(webexMessageBody(context, roomId)),
        });

        if (!response.ok) {
          const message = await errorMessage(response);
          return {
            status: "failed",
            sentAt,
            deliveredAt: null,
            failedReason: cleanFailureReason(
              `Webex API ${response.status}: ${message}`,
              token,
            ),
            isLive: true,
          };
        }

        try {
          const body = (await response.json()) as { id?: unknown };
          rememberThreadRoot(context.event?.id ?? null, body.id);
        } catch {
          // No root id captured; status updates will post at top level.
        }

        return {
          status: "delivered",
          sentAt,
          deliveredAt: sentAt,
          failedReason: null,
          isLive: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "failed",
          sentAt,
          deliveredAt: null,
          failedReason: cleanFailureReason(`Webex API request failed: ${message}`, token),
          isLive: true,
        };
      }
    },
  };
}

/**
 * A responder action worth echoing back into the Webex space so the guard
 * channel reads as a running incident thread, not a one-way siren. Only the
 * two lifecycle-defining actions are posted (acknowledge, resolve) to keep the
 * space signal-dense.
 */
/** Fields that render into a status message body. */
export interface WebexStatusContent {
  action: "acknowledged" | "resolved";
  responderName: string;
  speciesLabel: string | null;
  nodeName: string;
  /** Human-facing timestamp, already formatted (e.g. "18:42 IST"). */
  atLabel: string;
}

/** A status update to post, tied to its event so it can thread. */
export interface WebexStatusUpdate extends WebexStatusContent {
  eventId: string;
}

/** Pure markdown body for a responder status update — unit-testable. */
export function webexStatusMarkdown(content: WebexStatusContent): string {
  const species = content.speciesLabel ?? "large animal";
  if (content.action === "acknowledged") {
    return `**✅ Acknowledged — ${content.responderName}** is responding to the ${species} alert near ${content.nodeName}. (${content.atLabel})`;
  }
  return `**☑️ Resolved — ${species} near ${content.nodeName}** closed by ${content.responderName}. (${content.atLabel})`;
}

export interface WebexStatusResult {
  posted: boolean;
  isLive: boolean;
}

/**
 * Post a responder status update to the live Webex space. A no-op (never
 * throws, `posted: false`) when the bot token/room are not configured, so the
 * response flow is identical whether Webex runs live or in simulated fallback.
 */
export async function postWebexStatusUpdate(
  update: WebexStatusUpdate,
): Promise<WebexStatusResult> {
  const token = process.env.WEBEX_BOT_TOKEN;
  const roomId = process.env.WEBEX_ROOM_ID;
  if (token === undefined || token === "" || roomId === undefined || roomId === "") {
    return { posted: false, isLive: false };
  }
  // Thread the reply under the event's original alert card when we know it.
  const parentId = webexThreadRoots.get(update.eventId);
  const messageBody: Record<string, string> = {
    roomId,
    markdown: webexStatusMarkdown(update),
  };
  if (parentId !== undefined) messageBody.parentId = parentId;
  try {
    const response = await fetch(WEBEX_MESSAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(messageBody),
      // Bounded: the response path awaits this, so a slow/unreachable Webex
      // must never hang the guard's acknowledge.
      signal: AbortSignal.timeout(5_000),
    });
    return { posted: response.ok, isLive: true };
  } catch {
    return { posted: false, isLive: true };
  }
}

const adapters: Record<AlertChannel, ChannelAdapter> = {
  siren: simulatedAdapter("siren"),
  villager_phone: simulatedAdapter("villager_phone"),
  guard_webex: webexAdapter(),
  control_room: simulatedAdapter("control_room"),
  blindspot_ops: simulatedAdapter("blindspot_ops"),
};

export function adapterForChannel(channel: AlertChannel): ChannelAdapter {
  return adapters[channel];
}
