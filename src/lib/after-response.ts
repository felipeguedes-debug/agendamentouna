import { after } from "next/server";

/**
 * Keeps work already started alive after the answer goes out, on platforms that would
 * end the request there (D-92). Outside a request (tests, scripts) there is no answer
 * to wait for, so `after` refuses and the work simply runs.
 */
export function keepAliveAfterResponse(work: Promise<unknown>) {
  try {
    after(() => work);
  } catch {
    // Not in a request.
  }
}
