import { handleWebhookEvent } from "@/lib/cadence/webhook";
import { decryptSecret, sameSecret } from "@/lib/crypto/secrets";
import { isUuid, prisma } from "@/lib/db";

/**
 * WhatsAPI webhook, one URL per instance (D-05: the only way patients' answers come
 * in). Each event carries the instance token; the request is accepted only when it
 * matches the token stored for that instance, compared in constant time. The event
 * is handled before answering, so a "1" confirms within the request (Block 5 done
 * criterion: within 10 s).
 */
export async function POST(request: Request, context: RouteContext<"/api/webhooks/whatsapi/[instanceId]">) {
  const { instanceId } = await context.params;
  if (!isUuid(instanceId)) return Response.json({ error: "not_found" }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ error: "invalid_body" }, { status: 400 });

  // Base client: the instance is found by its id before any practice is known; the
  // event is then handled with the instance's practice only.
  const instance = await prisma.whatsappInstance.findUnique({ where: { id: instanceId }, select: { id: true, practiceId: true, tokenEncrypted: true } });
  if (!instance) return Response.json({ error: "not_found" }, { status: 404 });
  const token = (body as Record<string, unknown>).token;
  let expected: string;
  try {
    expected = decryptSecret(instance.tokenEncrypted);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (typeof token !== "string" || !sameSecret(token, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const outcome = await handleWebhookEvent(instance.practiceId, instance.id, body as Record<string, unknown>);
  return Response.json({ ok: true, event: outcome.event });
}
