import type { DispatchStatus } from "@/generated/prisma/enums";
import { forPractice } from "@/lib/db";
import type { InstanceConnection } from "@/lib/messaging";
import { setInstanceConnection } from "./instances";
import { handleIncomingMessage, type ReplyOutcome } from "./replies";

/**
 * Events of the WhatsAPI (uazapi) webhook, already authenticated by the route
 * (src/app/api/webhooks/whatsapi/[instanceId]/route.ts). The envelope carries
 * `EventType`; the fields of each event sit at the root:
 *
 * - messages: `message` {chatid, sender_pn, fromMe, isGroup, messageType, text} → a reply;
 * - messages_update: `state` or `event.Type` (Delivered, Read, Played) for `event.MessageIDs`
 *   → delivery status of our dispatches, never going backwards;
 * - connection: `instance.status` → the instance's connection (D-09).
 *
 * Each event costs a few queries and is handled before the answer, so a "1" changes
 * the status within the request.
 */

type Json = Record<string, unknown>;

export type WebhookOutcome =
  | { event: "messages"; reply: ReplyOutcome }
  | { event: "messages_update"; updated: number }
  | { event: "connection"; status: string | null }
  | { event: "ignored" };

const asRecord = (value: unknown): Json => (typeof value === "object" && value !== null ? (value as Json) : {});
const asString = (value: unknown) => (typeof value === "string" ? value : "");

const RECEIPT_STATUS: Record<string, DispatchStatus> = { Delivered: "DELIVERED", Read: "READ", Played: "READ" };
/** A receipt only moves a dispatch forward: Sent → Delivered → Read. */
const BEFORE: Record<string, DispatchStatus[]> = { DELIVERED: ["SENT"], READ: ["SENT", "DELIVERED"] };

export async function handleWebhookEvent(practiceId: string, instanceId: string, body: Json, now = new Date()): Promise<WebhookOutcome> {
  const eventType = asString(body.EventType);

  if (eventType === "messages") {
    const message = asRecord(body.message);
    const text = asString(message.text) || `[${asString(message.messageType) || "mensagem"}]`;
    const reply = await handleIncomingMessage(
      practiceId,
      instanceId,
      {
        from: asString(message.sender_pn) || asString(message.chatid) || asString(message.sender),
        text,
        fromMe: message.fromMe === true,
        isGroup: message.isGroup === true,
      },
      now,
    );
    return { event: "messages", reply };
  }

  if (eventType === "messages_update") {
    const event = asRecord(body.event);
    const status = RECEIPT_STATUS[asString(body.state) || asString(event.Type)];
    const ids = Array.isArray(event.MessageIDs) ? event.MessageIDs.filter((id): id is string => typeof id === "string") : [];
    if (!status || ids.length === 0) return { event: "messages_update", updated: 0 };
    const { count } = await forPractice(practiceId).dispatch.updateMany({
      where: { whatsappInstanceId: instanceId, providerMessageId: { in: ids }, status: { in: BEFORE[status] } },
      data: { status },
    });
    return { event: "messages_update", updated: count };
  }

  if (eventType === "connection") {
    const state = asString(asRecord(body.instance).status);
    const connection: InstanceConnection = state === "connected" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
    return { event: "connection", status: await setInstanceConnection(practiceId, instanceId, connection, now) };
  }

  return { event: "ignored" };
}
