import "dotenv/config";

// Tests always run against the disposable test database.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
delete process.env.DIRECT_URL;
// Whatever .env says, a test never writes to anyone (D-90).
process.env.EMAIL_PROVIDER = "console";

// Fixed auth settings, so tests never depend on the developer's .env. The Google
// credentials are fake: tests stub Google's token endpoint.
process.env.BETTER_AUTH_SECRET = "test-only-secret-not-used-anywhere-else-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
// Provider tokens (Block 5): a fixed test key, and the sandbox provider, which
// records messages in a table instead of sending them.
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
process.env.MESSAGING_PROVIDER = "sandbox";
// Google (Block 6): the fake Google of the SandboxGoogle tables, whatever the .env says.
process.env.GOOGLE_CALENDAR_PROVIDER = "sandbox";
delete process.env.GOOGLE_ALLOWED_ACCOUNTS;
// SynkronosCRM (Block 7): the fake CRM of the SandboxCrm tables, whatever the .env says.
process.env.CRM_PROVIDER = "sandbox";
delete process.env.CRM_ALLOWED_CONTACTS;
delete process.env.PUBLIC_WEBHOOK_URL;
// Web Push (Block 8): the fake delivery of SandboxPushMessage, whatever the .env says.
process.env.PUSH_PROVIDER = "sandbox";
delete process.env.PUSH_ALLOWED_USERS;

// Mirrors `experimental.authInterrupts` in next.config.ts, which `forbidden()` checks.
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";
