import { isProduction } from "../env";

/**
 * How the app and the migrations reach the database (D-97). Relative imports only: this
 * file is also read by prisma.config.ts and by the scripts, outside the app's alias.
 *
 * - DATABASE_URL is what the app uses: on Supabase, the transaction pooler (port 6543),
 *   which serverless needs and which takes no prepared statement. The driver names none
 *   unless asked to, and nothing here asks.
 * - DIRECT_URL is what the migrations use: the session pooler or the direct connection,
 *   because `prisma migrate` holds an advisory lock for the session.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TRANSACTION_POOLER_PORT = "6543";
const DEFAULT_POOL_MAX = 5;
// With 1, a query made while a transaction holds the only connection would wait forever.
const MIN_POOL_MAX = 2;
// Vercel's guidance for Fluid compute: close what is idle soon, so a suspended instance holds little.
const IDLE_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 10_000;

function parse(url: string | undefined) {
  if (!url || !URL.canParse(url)) return null;
  return new URL(url);
}

export function isLocalDatabase(url: string | undefined) {
  const parsed = parse(url);
  return parsed ? LOCAL_HOSTS.has(parsed.hostname) : false;
}

/** The URL the Prisma CLI connects with. */
export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.DIRECT_URL || env.DATABASE_URL || undefined;
}

export function assertMigratable(url: string | undefined) {
  const parsed = parse(url);
  if (!parsed) throw new Error("Defina DIRECT_URL (session pooler ou conexão direta) para aplicar as migrações.");
  if (parsed.port === TRANSACTION_POOLER_PORT || parsed.searchParams.get("pgbouncer") === "true") {
    throw new Error("As migrações não rodam pelo transaction pooler. Defina DIRECT_URL com o session pooler (porta 5432) ou a conexão direta.");
  }
}

/**
 * For what only makes sense on this machine: the demo seed, with its password in the
 * repository, and the commands that wipe or rewrite a database (D-98). It looks at the
 * address and not only at the environment, because an .env copied from production keeps
 * NODE_ENV empty and DATABASE_URL pointing at the real database.
 */
export function assertLocalDatabase(what: string, env: NodeJS.ProcessEnv = process.env) {
  if (isProduction(env)) throw new Error(`${what} não roda em produção.`);
  if (!isLocalDatabase(env.DATABASE_URL) || !isLocalDatabase(env.DIRECT_URL || env.DATABASE_URL)) {
    throw new Error(`${what} recusa banco remoto: só roda num banco desta máquina. Confira DATABASE_URL e DIRECT_URL.`);
  }
}

function poolSize(value: string | undefined) {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? Math.max(size, MIN_POOL_MAX) : DEFAULT_POOL_MAX;
}

export type PoolConfig = {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: { ca: string; rejectUnauthorized: true };
};

/**
 * The driver's settings. A local database keeps its defaults. A remote one takes TLS: with
 * DATABASE_CA_CERT (Supabase: Database settings, SSL) the server is verified. Without it,
 * only a sslmode written in the URL by the operator is accepted, and `disable` never is:
 * with neither, the driver would connect in the clear, and these are health data (PRD 7).
 */
export function poolConfig(connectionString: string, env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (isLocalDatabase(connectionString)) return { connectionString };
  const tuned = { max: poolSize(env.DATABASE_POOL_MAX), idleTimeoutMillis: IDLE_TIMEOUT_MS, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS };

  const certificate = env.DATABASE_CA_CERT?.replaceAll("\\n", "\n");
  if (certificate) {
    // A sslmode in the URL would replace these options inside pg.
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return { connectionString: url.toString(), ...tuned, ssl: { ca: certificate, rejectUnauthorized: true } };
  }

  const sslMode = parse(connectionString)?.searchParams.get("sslmode");
  if (!sslMode || sslMode === "disable") throw new Error("Banco remoto precisa de TLS: defina DATABASE_CA_CERT (ou, como escolha explícita, sslmode na URL).");
  return { connectionString, ...tuned };
}
