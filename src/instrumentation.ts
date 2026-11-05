import type { Instrumentation } from "next";

/**
 * Server errors go on the panel of the practice they happened in (D-101). Loaded on demand,
 * and only on Node.js: this file is compiled for every runtime, and the database client is not.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordRequestError } = await import("@/lib/observability/errors");
  await recordRequestError(error, request, context);
};
