import { forPractice, isUuid, prisma } from "@/lib/db";

/**
 * "Erros por conta" of PRD 7 (D-101), without an outside service: the server's errors and
 * the jobs that gave up. Only where it happened and which kind. Never the message, because it
 * could carry a patient's data (D-28), and never the address's query. The full error stays
 * in the platform's log, as Next prints it. Recording never breaks anything: the error being
 * reported may be the database itself.
 */

export const SERVER_ERROR_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;
const PRACTICE_PATH = /^\/(?:conta|pwa)\/([0-9a-f-]{36})(?:[/?]|$)/i;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
// How Next answers with a redirect, a 404, a 403 or a change of rendering: none of them failed.
const NEXT_CONTROL_FLOW = /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

export function practiceIdFromPath(path: string) {
  const id = PRACTICE_PATH.exec(path)?.[1];
  return id && isUuid(id) ? id : null;
}

function nameOf(error: unknown) {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && SAFE_ERROR_NAME.test(name) ? name : "Error";
}

function digestOf(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" ? digest.slice(0, 100) : null;
}

async function record(input: { practiceId: string | null; source: string; route: string; errorName: string; digest: string | null }) {
  console.warn(`[server-error] ${input.source} ${input.route} ${input.errorName}${input.digest ? ` ${input.digest}` : ""}`);
  if (!input.practiceId) return;
  try {
    await forPractice(input.practiceId).serverError.create({ data: { practiceId: input.practiceId, source: input.source, route: input.route.slice(0, 200), errorName: input.errorName, digest: input.digest } });
  } catch (error) {
    // A practice that does not exist, whose id came from the address, or the database itself.
    console.error("Could not record a server error", nameOf(error));
  }
}

/** Next's onRequestError (src/instrumentation.ts). routePath is the file's path: it has no ids. */
export async function recordRequestError(error: unknown, request: { path: string }, context: { routePath?: string; routeType?: string }) {
  const digest = digestOf(error);
  if (digest && NEXT_CONTROL_FLOW.test(digest)) return;
  await record({ practiceId: practiceIdFromPath(request.path), source: context.routeType ?? "render", route: context.routePath ?? "desconhecida", errorName: nameOf(error), digest });
}

type FailedJob = { function_id?: unknown; error?: unknown; run_id?: unknown; event?: { name?: unknown; data?: Record<string, unknown> } };

/** The body of Inngest's inngest/function.failed. */
export async function recordJobFailure(failure: FailedJob) {
  if (typeof failure.function_id !== "string") return;
  const practiceId = failure.event?.data?.practiceId;
  await record({ practiceId: typeof practiceId === "string" && isUuid(practiceId) ? practiceId : null, source: "job", route: failure.function_id, errorName: nameOf(failure.error), digest: null });
}

export async function pruneServerErrors(now = new Date()) {
  // Base client: the daily cleanup looks at every practice's rows.
  const { count } = await prisma.serverError.deleteMany({ where: { occurredAt: { lt: new Date(now.getTime() - SERVER_ERROR_RETENTION_DAYS * DAY_MS) } } });
  return count;
}
