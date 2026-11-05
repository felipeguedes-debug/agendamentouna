import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import {
  E2E_PASSWORD,
  PWA_CANCELED_PATIENT,
  PWA_CONFIRM_APPOINTMENT_ID,
  PWA_CONFIRM_PATIENT,
  PWA_GOOGLE_PATIENT,
  PWA_NEXT_PATIENT,
  PWA_PRACTICE_NAME,
  PWA_PROFESSIONAL_EMAIL,
  PWA_PROFESSIONAL_NAME,
  PWA_SECRETARY_EMAIL,
} from "./data";

// Block 8 (PRD 11, D-76 to D-78): the professional's PWA in a real Chromium. What this
// cannot show is installing and being notified on a real phone, recorded in D-79.

const shown = (locator: Locator) => locator.filter({ visible: true });

const FAKE_ENDPOINT = "https://push.e2e.test/device-1";

function push(...args: string[]) {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(process.execPath, [tsx, path.join("scripts", "push-sandbox.ts"), ...args], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST, PUSH_PROVIDER: "sandbox" },
    encoding: "utf8",
  });
}

/** See the note in e2e/google.spec.ts on the sign-in limit. */
async function signIn(page: Page, email: string, url: RegExp) {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login");
    await shown(page.getByLabel("E-mail")).fill(email);
    await shown(page.getByLabel("Senha")).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await expect(page).toHaveURL(url);
      return new URL(page.url()).pathname;
    } catch (error) {
      if (attempt > 1 || !(await page.getByText("Muitas tentativas").isVisible())) throw error;
      await page.waitForTimeout(10_000);
    }
  }
}

/** Opens the app as the professional, from where the installed app starts. */
async function openDay(page: Page) {
  await signIn(page, PWA_PROFESSIONAL_EMAIL, /\/conta\/[0-9a-f-]{36}$/);
  await page.goto("/pwa");
  await expect(page).toHaveURL(/\/pwa\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

/** What the installed app sees. No test browser reports it by itself. */
async function asInstalledApp(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes("display-mode: standalone") ? ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList) : original(query);
  });
}

/** Chromium's push service is not reachable from a test, so the browser side is played here. */
async function withFakePushService(context: BrowserContext, endpoint: string) {
  await context.addInitScript((url) => {
    const KEY = "fake-push-subscribed";
    const subscription = {
      endpoint: url,
      toJSON: () => ({ endpoint: url, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    };
    PushManager.prototype.subscribe = async function subscribe() {
      localStorage.setItem(KEY, "1");
      return subscription as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      return (localStorage.getItem(KEY) ? subscription : null) as unknown as PushSubscription | null;
    };
    // Headless Chromium starts with notifications blocked; a phone starts by asking.
    Object.defineProperty(Notification, "permission", { get: () => "default" });
    Notification.requestPermission = async () => "granted";
  }, endpoint);
}

async function cachedPaths(page: Page) {
  return page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
    }
    return paths.sort();
  });
}

test("the browser finds the app installable: manifest, icons and service worker", async ({ page, context }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ display: "standalone", start_url: "/pwa", scope: "/" });

  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["cache-control"]).toContain("no-store");

  const practicePath = await openDay(page);
  expect(practicePath).toMatch(/^\/pwa\//);
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Chromium's own check for the install prompt. Playwright's contexts are incognito, which
  // Chromium reports as such and which a phone is not.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
  expect(installabilityErrors.map((error) => error.errorId).filter((id) => id !== "in-incognito")).toEqual([]);
});

test("the day shows the next appointment, what waits in Google, and marks the arrival", async ({ page }) => {
  await openDay(page);
  await expect(page.getByRole("heading", { name: PWA_PROFESSIONAL_NAME })).toBeVisible();

  const next = page.getByTestId("next-appointment");
  await expect(next).toContainText(PWA_NEXT_PATIENT.name);
  await expect(next.getByTestId("status")).toHaveText("Confirmado");
  await expect(page.getByTestId("day-total")).toHaveText("2");
  await expect(page.getByTestId("day-confirmed")).toHaveText("1");

  // The one canceled stays on the list, crossed out, with nothing to do.
  const canceled = page.getByTestId("day-row").filter({ hasText: PWA_CANCELED_PATIENT.name });
  await expect(canceled.getByTestId("status")).toHaveText("Cancelado pelo paciente");
  await expect(canceled.getByRole("button")).toHaveCount(0);

  // The professional decides on the change made in Google (D-10).
  const pending = page.getByTestId("google-pending");
  await expect(pending).toContainText(PWA_GOOGLE_PATIENT.name);
  await pending.getByRole("button", { name: "Aceitar" }).click();
  await expect(pending).toHaveCount(0);

  await next.getByRole("button", { name: "Marcar chegada" }).click();
  await expect(next.getByTestId("status")).toHaveText("Chegou");
  await expect(next.getByRole("button", { name: "Iniciar atendimento" })).toBeVisible();
});

test("nothing of the agenda is cached, and without a connection the screen says so", async ({ page, context }) => {
  const dayPath = await openDay(page);

  const response = await page.reload();
  expect(response?.headers()["cache-control"]).toContain("no-store");

  // Only the offline page and an icon: no screen, no response.
  expect(await cachedPaths(page)).toEqual(["/icons/icon-192.png", "/offline.html"]);

  await expect(page.getByTestId("next-appointment")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId("connection-notice")).toContainText("Sem conexão");
  await expect(page.getByText(PWA_NEXT_PATIENT.name)).toHaveCount(0);
  // Nor the day's counts, which would be just as old.
  await expect(page.getByTestId("day-total")).toHaveCount(0);

  // Opening the app with no connection gets the page with no data.
  await page.goto(dayPath).catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
  expect(await page.content()).not.toContain(PWA_NEXT_PATIENT.name);

  // When the connection comes back, the page reloads by itself.
  await context.setOffline(false);
  await expect(page.getByTestId("next-appointment")).toContainText(PWA_NEXT_PATIENT.name);
});

test("a remembered device stays signed in for 30 days, and a browser tab does not", async ({ page, context }) => {
  await openDay(page);
  const sessionExpiry = async () => (await context.cookies()).find((cookie) => cookie.name.includes("session_token"))!.expires;
  const days = (seconds: number) => (seconds - Date.now() / 1000) / 86_400;

  // A browser tab: 12 h, and nothing to accept.
  expect(days(await sessionExpiry())).toBeLessThan(1);
  await expect(page.getByTestId("install-hint")).toBeVisible();
  await expect(page.getByTestId("device-panel")).toHaveCount(0);

  await asInstalledApp(context);
  await page.reload();
  await expect(page.getByTestId("install-hint")).toHaveCount(0);
  const panel = page.getByTestId("device-panel");
  await panel.getByRole("button", { name: "Manter conectado por 30 dias" }).click();
  await expect(panel.getByRole("heading", { name: "Aparelho conectado", exact: true })).toBeVisible();
  expect(days(await sessionExpiry())).toBeGreaterThan(29);

  // The way out, for a phone that was lost.
  await page.goto("/seguranca");
  const devices = page.getByTestId("remembered-devices");
  await expect(devices).toContainText("este aparelho");
  await devices.getByRole("button", { name: "Encerrar" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("the professional hears about a confirmation, without a patient's name; signing out stops it", async ({ page, context, browser }) => {
  await asInstalledApp(context);
  await withFakePushService(context, FAKE_ENDPOINT);
  const dayPath = await openDay(page);

  const panel = page.getByTestId("device-panel");
  await panel.getByRole("button", { name: "Manter conectado por 30 dias" }).click();
  await panel.getByRole("button", { name: "Avisar quando um paciente confirmar" }).click();
  await expect(panel.getByRole("button", { name: "Desligar avisos" })).toBeVisible();
  expect(push("assinaturas", "--email", PWA_PROFESSIONAL_EMAIL)).toContain("Assinaturas: 1");

  // The screen remembers it after a reload.
  await page.reload();
  await page.getByRole("button", { name: "Notificações e este aparelho" }).click();
  await expect(panel.getByRole("button", { name: "Desligar avisos" })).toBeVisible();

  // The secretary confirms the appointment on her screen.
  const office = await browser.newContext();
  const secretary = await office.newPage();
  const practicePath = await signIn(secretary, PWA_SECRETARY_EMAIL, /\/conta\/[0-9a-f-]{36}$/);
  await secretary.goto(`${practicePath}/agendamentos/${PWA_CONFIRM_APPOINTMENT_ID}`);
  await secretary.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(shown(secretary.getByTestId("status")).first()).toHaveText("Confirmado");
  await office.close();

  // Inngest's job, here by hand: there is no Inngest in the end-to-end flows (D-46).
  push("enviar");
  const delivered = push("listar", "--endpoint", FAKE_ENDPOINT);
  expect(delivered).toContain("Avisos: 1");
  expect(delivered).toContain("Um paciente confirmou o horário");
  expect(delivered).toContain(dayPath);
  for (const secret of [PWA_CONFIRM_PATIENT.name, PWA_PROFESSIONAL_NAME, PWA_PRACTICE_NAME, "Consulta"]) expect(delivered).not.toContain(secret);

  // And the screen shows it, on its next update.
  await page.reload();
  await expect(page.getByTestId("day-confirmed")).toHaveText("2");

  // Signing out ends the session, the notices and everything on screen.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(push("assinaturas", "--email", PWA_PROFESSIONAL_EMAIL)).toContain("Assinaturas: 0");
  expect(await page.evaluate(() => localStorage.getItem("fake-push-subscribed"))).toBeNull();
  expect(await cachedPaths(page)).toEqual(["/icons/icon-192.png", "/offline.html"]);

  await page.goto(dayPath);
  await expect(page).toHaveURL(/\/login/);
  expect(await page.content()).not.toContain(PWA_NEXT_PATIENT.name);
  await page.goBack().catch(() => undefined);
  expect(await page.content()).not.toContain(PWA_NEXT_PATIENT.name);
});

// D-79: on a real Android the session outlived a reported "Sair". The screen must never
// look signed out while the session, 30 days long, and its notices are still alive.
test("when signing out does not reach the server, the screen says so and stays", async ({ page, context }) => {
  const dayPath = await openDay(page);
  const sessionCookie = async () => (await context.cookies()).find((cookie) => cookie.name.includes("session_token"));
  const refusal = page.getByText("Não foi possível sair");
  const signOutUrl = "**/api/auth/sign-out";

  // The server refuses.
  await page.route(signOutUrl, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(refusal).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(dayPath);
  expect(await sessionCookie()).toBeDefined();
  await page.unroute(signOutUrl);

  // The request does not get there.
  await page.route(signOutUrl, (route) => route.abort());
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeEnabled();
  await expect(refusal).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(dayPath);
  await page.unroute(signOutUrl);

  // With the server answering, it leaves for real.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await sessionCookie()).toBeUndefined();
});

test("the screen answers with the status of the agenda's rules (D-72)", async ({ page }) => {
  const anonymous = await page.request.get("/pwa", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toContain("/login");

  const dayPath = await openDay(page);
  const denied = await page.goto("/pwa/11111111-1111-4111-8111-111111111111");
  expect(denied?.status()).toBe(404);
  const own = await page.goto(dayPath);
  expect(own?.status()).toBe(200);
});
