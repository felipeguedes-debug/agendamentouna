import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

import { requestBlockGoogleSync, requestCalendarSync, requestConnectionSync } from "@/lib/google/queue";
import { requestConfirmationPush } from "@/lib/push/queue";
import { inngest, requestDrain } from "./client";

// Nobody's screen waits for Inngest (D-92): the event goes out in the background, and
// a platform that ends the request early still lets it finish.

const send = vi.spyOn(inngest, "send");
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

beforeEach(() => {
  after.mockReset();
  send.mockReset();
  warn.mockClear();
});

afterEach(() => vi.useRealTimers());

const REQUESTS: [string, () => Promise<unknown>][] = [
  ["requestDrain", () => requestDrain("practice", "instance")],
  ["requestConfirmationPush", () => requestConfirmationPush("practice")],
  ["requestBlockGoogleSync", () => requestBlockGoogleSync("practice")],
  ["requestConnectionSync", () => requestConnectionSync("connection")],
  ["requestCalendarSync", () => requestCalendarSync("calendar", "connection")],
];

describe.each(REQUESTS)("%s", (_name, request) => {
  it("answers without waiting for Inngest", async () => {
    send.mockReturnValue(new Promise(() => undefined));
    await request();
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps the event alive after the response", async () => {
    send.mockResolvedValue({ ids: [] } as never);
    await request();
    expect(after).toHaveBeenCalledOnce();
    await expect(after.mock.calls[0][0]()).resolves.not.toThrow();
  });

  it("only warns when Inngest cannot be reached", async () => {
    send.mockRejectedValue(new Error("fetch failed"));
    await expect(request()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(warn.mock.calls[0]).toEqual([expect.stringContaining("Inngest unreachable"), "fetch failed"]);
  });

  it("still sends outside a request, where after() is not available", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    send.mockResolvedValue({ ids: [] } as never);
    await expect(request()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the app's code", () => {
  it("never waits for inngest.send: a new event goes through sendWithoutWaiting", () => {
    const waiting = sourceFiles("src").filter((file) => /await inngest\.send\(/.test(readFileSync(file, "utf8")));
    expect(waiting).toEqual([]);
  });
});
