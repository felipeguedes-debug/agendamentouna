import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CRM_EXPORT_EVENT } from "@/lib/crm/queue";
import { GOOGLE_CONNECTION_SYNC_EVENT, GOOGLE_EXPORT_EVENT } from "@/lib/google/queue";
import { PUSH_CONFIRMATIONS_EVENT } from "@/lib/push/queue";
import { DRAIN_INSTANCE_EVENT } from "./client";
import { functions } from "./functions";
import { runMinuteTick, type TickSources } from "./tick";

// One function does what five crons did (D-100): the plan of Inngest is counted per run and
// per step, so the idle system stays inside the free plan, which stops at its quota. The
// rules stay where they are; this only decides what is due and asks for it.

const DUE_INSTANCE = { practiceId: "p1", instanceId: "i1" };
const CRM_PRACTICE = { practiceId: "p2", accountId: "a1" };

function sources(overrides: Partial<TickSources> = {}): TickSources {
  return {
    dueInstances: vi.fn(async () => []),
    googleExports: vi.fn(async () => []),
    crmExports: vi.fn(async () => []),
    pendingPushes: vi.fn(async () => []),
    googleConnections: vi.fn(async () => []),
    checkInstances: vi.fn(async () => 0),
    ...overrides,
  };
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 3, 12, minute));

describe("runMinuteTick", () => {
  it("sends nothing when nothing is due", async () => {
    const send = vi.fn(async () => undefined);
    await expect(runMinuteTick(at(1), { sources: sources(), send })).resolves.toEqual({ events: 0, checked: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("asks for each queue's work in one send", async () => {
    const send = vi.fn(async () => undefined);
    await runMinuteTick(at(1), {
      send,
      sources: sources({
        dueInstances: async () => [DUE_INSTANCE],
        googleExports: async () => ["p3"],
        crmExports: async () => [CRM_PRACTICE],
        pendingPushes: async () => [{ practiceId: "p4" }],
      }),
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]).toEqual([
      [
        { name: DRAIN_INSTANCE_EVENT, data: DUE_INSTANCE },
        { name: GOOGLE_EXPORT_EVENT, data: { practiceId: "p3" } },
        { name: CRM_EXPORT_EVENT, data: CRM_PRACTICE },
        { name: PUSH_CONFIRMATIONS_EVENT, data: { practiceId: "p4" } },
      ],
    ]);
  });

  it("every 4 minutes polls Google, which is what keeps the 5 minutes of PRD 7 without a push (D-61)", async () => {
    for (const minute of [0, 4, 8, 56]) {
      const send = vi.fn(async () => undefined);
      await runMinuteTick(at(minute), { send, sources: sources({ googleConnections: async () => ["c1"] }) });
      expect(send, `minute ${minute}`).toHaveBeenCalledWith([{ name: GOOGLE_CONNECTION_SYNC_EVENT, data: { connectionId: "c1" } }]);
    }
    for (const minute of [1, 2, 3, 5, 57]) {
      const send = vi.fn(async () => undefined);
      await runMinuteTick(at(minute), { send, sources: sources({ googleConnections: async () => ["c1"] }) });
      expect(send, `minute ${minute}`).not.toHaveBeenCalled();
    }
  });

  it("every 5 minutes checks the instances (D-54), after sending, so a slow one holds nothing up", async () => {
    const order: string[] = [];
    const send = vi.fn(async () => {
      order.push("send");
    });
    const checkInstances = vi.fn(async () => {
      order.push("check");
      return 2;
    });
    const result = await runMinuteTick(at(5), { send, sources: sources({ dueInstances: async () => [DUE_INSTANCE], checkInstances }) });
    expect(order).toEqual(["send", "check"]);
    expect(result).toEqual({ events: 1, checked: true });

    const notDue = vi.fn(async () => 0);
    await runMinuteTick(at(6), { send, sources: sources({ checkInstances: notDue }) });
    expect(notDue).not.toHaveBeenCalled();
  });

  it("a queue that fails does not stop the others, and the run fails after them, for Inngest to retry", async () => {
    const send = vi.fn(async () => undefined);
    const failing = sources({ googleExports: vi.fn(async () => Promise.reject(new Error("database gone"))), dueInstances: async () => [DUE_INSTANCE] });
    await expect(runMinuteTick(at(1), { send, sources: failing })).rejects.toThrow("database gone");
    expect(send).toHaveBeenCalledWith([{ name: DRAIN_INSTANCE_EVENT, data: DUE_INSTANCE }]);
  });

  it("an instance check that fails does not lose what was already asked", async () => {
    const send = vi.fn(async () => undefined);
    await expect(runMinuteTick(at(5), { send, sources: sources({ dueInstances: async () => [DUE_INSTANCE], checkInstances: async () => Promise.reject(new Error("provider down")) }) })).rejects.toThrow("provider down");
    expect(send).toHaveBeenCalledOnce();
  });
});

/** Runs of a cron in a 30-day month; only the shapes this project uses. */
function runsPerMonth(cron: string) {
  const [minute, hour] = cron.split(" ");
  const perHour = minute === "*" ? 60 : minute.startsWith("*/") ? 60 / Number(minute.slice(2)) : 1;
  return perHour * (hour === "*" ? 24 : 1) * 30;
}

describe("the system standing still", () => {
  type Fn = { opts: { id: string; triggers?: { cron?: string; event?: string }[] } };
  const crons = (functions as unknown as Fn[]).flatMap((fn) => (fn.opts.triggers ?? []).flatMap((trigger) => (trigger.cron ? [{ id: fn.opts.id, cron: trigger.cron }] : [])));

  it("has one function per minute, and the daily ones", () => {
    expect(crons.map((cron) => cron.cron).sort()).toEqual(["* * * * *", "0 20 * * *", "0 6 * * *", "0 7 * * *"]);
  });

  it("fits in the 50 thousand executions a month of the free plan, with room left", () => {
    const executions = crons.reduce((total, cron) => total + runsPerMonth(cron.cron), 0);
    expect(executions).toBe(43_290);
    expect(executions).toBeLessThan(45_000);
  });

  it("spends a step only where it holds something, the 8 s between messages of an instance", () => {
    const source = readFileSync("src/lib/inngest/functions.ts", "utf8");
    // Each function below has one piece of work: a step would double its count and retry the same.
    expect(source.match(/step\.(run|sendEvent|sleep)\(/g)).toEqual(["step.run(", "step.sleep(", "step.sleep("]);
  });
});
