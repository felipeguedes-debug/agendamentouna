import { handleCrmWebhook } from "@/lib/crm/webhook";

/**
 * SynkronosCRM webhook, one URL per account, with a secret in the path because
 * FlwChat's subscription has no signature (D-67). Only the secretary's commands come
 * by here; the patient's messages come by the WhatsAPI webhook (D-05).
 */
export async function POST(request: Request, context: RouteContext<"/api/webhooks/synkronos/[token]">) {
  const { token } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const answer = await handleCrmWebhook(token, body);
  return Response.json(answer.body, { status: answer.status });
}
