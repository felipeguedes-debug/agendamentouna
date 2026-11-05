import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (D-46): a production build on its own port, against the test
// database (agenda_test), which e2e/global-setup.ts rebuilds. `next dev` cannot run
// twice in one folder, so this does not clash with a dev server on port 3000.
// Do not run together with `npm test`: both use agenda_test. Another worktree running
// at the same time needs its own DATABASE_URL_TEST and E2E_PORT.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const next = `"${process.execPath}" node_modules/next/dist/bin/next`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${next} build && ${next} start --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    // The build alone has passed 300 s on a machine with little free memory.
    timeout: 600_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      BETTER_AUTH_URL: baseURL,
      NEXT_TELEMETRY_DISABLED: "1",
      // On the test database the production build stays in the sandbox, whatever .env asks for (D-46, D-95).
      MESSAGING_PROVIDER: "sandbox",
      GOOGLE_CALENDAR_PROVIDER: "sandbox",
      CRM_PROVIDER: "sandbox",
      // On the terminal, whatever .env says: the flows never write to anyone (D-90).
      EMAIL_PROVIDER: "console",
      // The fake delivery of the notices (D-78), with a public key only the screen needs.
      PUSH_PROVIDER: "sandbox",
      VAPID_PUBLIC_KEY: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
    },
  },
});
