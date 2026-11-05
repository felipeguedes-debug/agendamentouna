/**
 * Which environment this is (D-95). Vercel sets NODE_ENV=production on previews too, so
 * whatever decides between a real provider and the sandbox, or whether an allow list
 * applies, asks here and never reads NODE_ENV. A preview behaves as a test environment.
 * NODE_ENV still decides what is about the build itself, like secure cookies.
 */

export function isProduction(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/** The name the test database must have (D-32); no real environment has it. */
const TEST_DATABASE_URL = /\/[^/?]*_test(\?|$)/;

export function usesTestDatabase(env: NodeJS.ProcessEnv = process.env) {
  return TEST_DATABASE_URL.test(env.DATABASE_URL ?? "");
}

/**
 * Production always reaches the real providers, whatever their variables say, except the
 * production build of the end-to-end flows, which runs on the test database (D-46) and has
 * nobody real to talk to.
 */
export function requiresRealProviders(env: NodeJS.ProcessEnv = process.env) {
  return isProduction(env) && !usesTestDatabase(env);
}

function vercelAddress(host: string | undefined) {
  return host ? `https://${host}` : undefined;
}

/**
 * The app's address, for links and for Better Auth. A preview has none known in advance,
 * so BETTER_AUTH_URL stays empty there and the branch's address, which survives new
 * pushes, takes its place.
 */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  const vercel = env.VERCEL_ENV === "production" ? vercelAddress(env.VERCEL_PROJECT_PRODUCTION_URL) : (vercelAddress(env.VERCEL_BRANCH_URL) ?? vercelAddress(env.VERCEL_URL));
  return vercel ?? "http://localhost:3000";
}

/** The addresses Better Auth accepts requests from: a preview answers at two of them. */
export function appOrigins(env: NodeJS.ProcessEnv = process.env) {
  const preview = env.VERCEL_ENV === "production" ? [] : [vercelAddress(env.VERCEL_BRANCH_URL), vercelAddress(env.VERCEL_URL)];
  return [...new Set([appBaseUrl(env), ...preview].filter((origin): origin is string => Boolean(origin)))];
}
