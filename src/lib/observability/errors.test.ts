import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { forPractice, prisma } from "@/lib/db";
import { createPractice } from "../../../tests/helpers/auth";
import { practiceIdFromPath, pruneServerErrors, recordJobFailure, recordRequestError, SERVER_ERROR_RETENTION_DAYS } from "./errors";

// "Erros por conta" of PRD 7 (D-101): where it happened and which kind, never the message,
// which could carry a patient's data (D-28). Recording never breaks the answer it comes from.

let practiceId: string;
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Erros"));
});

afterEach(() => {
  warn.mockClear();
  error.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const context = { routePath: "/conta/[practiceId]/regua", routeType: "render" as const };
const rows = (where: object = {}) => forPractice(practiceId).serverError.findMany({ where, orderBy: { occurredAt: "desc" } });

describe("practiceIdFromPath", () => {
  it("finds the practice in the app's addresses, with or without a query", () => {
    const id = "5e2e0000-0000-4000-8000-000000000001";
    expect(practiceIdFromPath(`/conta/${id}`)).toBe(id);
    expect(practiceIdFromPath(`/conta/${id}/regua?semana=2`)).toBe(id);
    expect(practiceIdFromPath(`/pwa/${id}`)).toBe(id);
  });

  it("finds none anywhere else", () => {
    for (const path of ["/", "/login", "/conta/abc/regua", "/api/inngest", `/convite/5e2e0000-0000-4000-8000-000000000001`]) expect(practiceIdFromPath(path), path).toBeNull();
  });
});

describe("recordRequestError", () => {
  it("keeps the practice, the route, the kind and the digest", async () => {
    const failure = Object.assign(new TypeError("boom"), { digest: "123456" });
    await recordRequestError(failure, { path: `/conta/${practiceId}/regua` }, context);
    const [row] = await rows({ digest: "123456" });
    expect(row).toMatchObject({ practiceId, source: "render", route: "/conta/[practiceId]/regua", errorName: "TypeError", digest: "123456" });
  });

  it("never keeps the message, which could carry a patient's name", async () => {
    const failure = new Error("Paciente Maria Souza, celular +5585998124455, não encontrado");
    await recordRequestError(failure, { path: `/conta/${practiceId}/pacientes/42?busca=maria` }, { routePath: "/conta/[practiceId]/pacientes/[pacienteId]", routeType: "action" });
    const [row] = await rows({ source: "action" });
    expect(JSON.stringify(row)).not.toMatch(/Maria|8598124455|busca/);
    expect(row.route).toBe("/conta/[practiceId]/pacientes/[pacienteId]");
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Maria|8598124455/);
  });

  it("does not let a strange error name carry text in", async () => {
    const failure = Object.assign(new Error("x"), { name: "Paciente Maria Souza faltou" });
    await recordRequestError(failure, { path: `/conta/${practiceId}` }, { routePath: "/conta/[practiceId]", routeType: "route" });
    expect((await rows({ source: "route" }))[0].errorName).toBe("Error");
  });

  it("ignores what is Next's own way of answering, as a redirect, a 404 or a 403", async () => {
    const before = (await rows()).length;
    for (const digest of ["NEXT_REDIRECT;replace;/login;307;", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK;403", "DYNAMIC_SERVER_USAGE", "BAILOUT_TO_CLIENT_SIDE_RENDERING"]) {
      await recordRequestError(Object.assign(new Error(digest), { digest }), { path: `/conta/${practiceId}` }, context);
    }
    expect(await rows()).toHaveLength(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it("only logs what belongs to no practice", async () => {
    const before = await prisma.serverError.count();
    await recordRequestError(new RangeError("x"), { path: "/login" }, { routePath: "/login", routeType: "render" });
    expect(await prisma.serverError.count()).toBe(before);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0].join(" ")).toContain("RangeError");
  });

  it("does not fail when the row cannot be written: the id came from the address, and the error may be the database's", async () => {
    await expect(recordRequestError(new Error("x"), { path: "/conta/00000000-0000-4000-8000-000000000000" }, context)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0].join(" ")).not.toContain("00000000");
  });
});

describe("recordJobFailure", () => {
  it("puts a job's failure on the practice it was working for", async () => {
    await recordJobFailure({ function_id: "agenda-consultorios-google-export", run_id: "run", error: { name: "GoogleError", message: "Paciente Maria" }, event: { name: "google/appointments.export", data: { practiceId } } });
    const [row] = await rows({ source: "job" });
    expect(row).toMatchObject({ route: "agenda-consultorios-google-export", errorName: "GoogleError" });
    expect(JSON.stringify(row)).not.toContain("Maria");
  });

  it("only logs a job that was not working for a practice", async () => {
    const before = await prisma.serverError.count();
    await recordJobFailure({ function_id: "agenda-consultorios-google-connection-sync", run_id: "run", error: { name: "GoogleError", message: "x" }, event: { name: "google/connection.sync", data: { connectionId: "c1" } } });
    expect(await prisma.serverError.count()).toBe(before);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not fail on a body it does not recognize", async () => {
    await expect(recordJobFailure({} as Parameters<typeof recordJobFailure>[0])).resolves.toBeUndefined();
    await expect(recordJobFailure({ function_id: "x", event: { name: "y", data: { practiceId: "não é uuid" } } })).resolves.toBeUndefined();
  });
});

describe("pruneServerErrors", () => {
  it("removes what is older than the retention, in every practice", async () => {
    const now = new Date();
    const old = await forPractice(practiceId).serverError.create({ data: { practiceId, source: "render", route: "/velha", errorName: "Error", occurredAt: new Date(now.getTime() - (SERVER_ERROR_RETENTION_DAYS + 1) * 86_400_000) } });
    const recent = await forPractice(practiceId).serverError.create({ data: { practiceId, source: "render", route: "/recente", errorName: "Error", occurredAt: new Date(now.getTime() - (SERVER_ERROR_RETENTION_DAYS - 1) * 86_400_000) } });
    await pruneServerErrors(now);
    expect(await prisma.serverError.count({ where: { id: old.id } })).toBe(0);
    expect(await prisma.serverError.count({ where: { id: recent.id } })).toBe(1);
  });
});
