import { checkGooglePush } from "@/lib/google/jobs";
import { requestCalendarSync } from "@/lib/google/queue";

/**
 * Google push notifications (PRD 5, Fluxo de dados; D-61). Google posts headers
 * only: the channel and its token are checked (src/lib/google/jobs.ts), and the
 * calendar is read by Inngest, so the answer goes back at once. The 4-minute
 * polling reads it anyway when a push is lost.
 */
export async function POST(request: Request) {
  const outcome = await checkGooglePush(request.headers);
  if (outcome.calendar) await requestCalendarSync(outcome.calendar.id, outcome.calendar.connectionId);
  return new Response(null, { status: outcome.status });
}
