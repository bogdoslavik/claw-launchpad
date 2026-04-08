import { describe, expect, it, vi } from "vitest";

import {
  buildTrackingScheduleCron,
  IntervalWorkerScheduler,
  PgBossWorkerScheduler,
  type BossLike,
} from "../src/scheduler.js";

function createBossMock(overrides?: Partial<BossLike>): BossLike & { workHandler?: () => Promise<unknown> } {
  const boss: BossLike & { workHandler?: () => Promise<unknown> } = {
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue(null),
    createQueue: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockImplementation(async (_name, _options, handler) => {
      boss.workHandler = async () => {
        await handler([{ id: "job-1" }]);
      };
      return "worker-1";
    }),
    ...overrides,
  };

  return boss;
}

describe("buildTrackingScheduleCron", () => {
  it("supports common second-based intervals", () => {
    expect(buildTrackingScheduleCron(10_000)).toBe("*/10 * * * * *");
    expect(buildTrackingScheduleCron(30_000)).toBe("*/30 * * * * *");
    expect(buildTrackingScheduleCron(60_000)).toBe("0 * * * * *");
    expect(buildTrackingScheduleCron(300_000)).toBe("0 */5 * * * *");
  });

  it("returns null for intervals that cannot be expressed as a compact cron", () => {
    expect(buildTrackingScheduleCron(7_500)).toBeNull();
    expect(buildTrackingScheduleCron(70_000)).toBeNull();
    expect(buildTrackingScheduleCron(5_400_000)).toBeNull();
  });
});

describe("PgBossWorkerScheduler", () => {
  it("creates the queue, schedules recurring ticks and runs the worker", async () => {
    const boss = createBossMock();
    const worker = {
      runOnce: vi.fn().mockResolvedValue([]),
    };

    const scheduler = new PgBossWorkerScheduler(boss, worker, 10_000, console);
    await scheduler.start();

    expect(boss.start).toHaveBeenCalledOnce();
    expect(boss.getQueue).toHaveBeenCalledWith("deployment_tracking_tick");
    expect(boss.createQueue).toHaveBeenCalledWith("deployment_tracking_tick", {
      policy: "exclusive",
      retryLimit: 0,
      deleteAfterSeconds: 300,
    });
    expect(boss.schedule).toHaveBeenCalledWith(
      "deployment_tracking_tick",
      "*/10 * * * * *",
      { kind: "track-pending-deployments" },
      { key: "default" },
    );

    await boss.workHandler?.();
    expect(worker.runOnce).toHaveBeenCalledOnce();

    await scheduler.stop();
    expect(boss.stop).toHaveBeenCalledOnce();
  });

  it("does not recreate an existing queue", async () => {
    const boss = createBossMock({
      getQueue: vi.fn().mockResolvedValue({
        name: "deployment_tracking_tick",
        policy: "exclusive",
      }),
    });
    const worker = {
      runOnce: vi.fn().mockResolvedValue([]),
    };

    const scheduler = new PgBossWorkerScheduler(boss, worker, 10_000, console);
    await scheduler.start();

    expect(boss.createQueue).not.toHaveBeenCalled();
  });
});

describe("IntervalWorkerScheduler", () => {
  it("proxies start and stop to the interval worker", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const scheduler = new IntervalWorkerScheduler(start, stop);

    await scheduler.start();
    await scheduler.stop();

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});
