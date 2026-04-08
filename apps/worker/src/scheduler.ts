import { PgBoss } from "pg-boss";

import type { TrackDeploymentResult } from "@launchpad/core";

const TRACK_DEPLOYMENTS_QUEUE = "deployment_tracking_tick";
const TRACK_DEPLOYMENTS_SCHEDULE_KEY = "default";

export interface WorkerRunner {
  runOnce(): Promise<TrackDeploymentResult[]>;
}

export interface WorkerScheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BossLike {
  on(event: "error", listener: (error: Error) => void): unknown;
  start(): Promise<unknown>;
  stop(options?: { graceful?: boolean; timeout?: number }): Promise<void>;
  getQueue(name: string): Promise<{ name: string; policy?: string } | null>;
  createQueue(
    name: string,
    options?: {
      policy?: string;
      retryLimit?: number;
      deleteAfterSeconds?: number;
    },
  ): Promise<void>;
  schedule(
    name: string,
    cron: string,
    data?: object | null,
    options?: { key?: string },
  ): Promise<void>;
  work(
    name: string,
    options: {
      pollingIntervalSeconds?: number;
      batchSize?: number;
    },
    handler: (jobs: Array<{ id: string; data?: unknown }>) => Promise<unknown>,
  ): Promise<string>;
}

interface LoggerLike {
  error(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
}

export function buildTrackingScheduleCron(pollIntervalMs: number): string | null {
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error("pollIntervalMs must be a positive integer");
  }

  if (pollIntervalMs % 1000 !== 0) {
    return null;
  }

  const totalSeconds = pollIntervalMs / 1000;

  if (totalSeconds < 60 && 60 % totalSeconds === 0) {
    return `*/${totalSeconds} * * * * *`;
  }

  if (totalSeconds === 60) {
    return "0 * * * * *";
  }

  if (totalSeconds % 60 === 0) {
    const totalMinutes = totalSeconds / 60;

    if (totalMinutes < 60 && 60 % totalMinutes === 0) {
      return `0 */${totalMinutes} * * * *`;
    }

    if (totalMinutes === 60) {
      return "0 0 * * * *";
    }

    if (totalMinutes % 60 === 0) {
      const totalHours = totalMinutes / 60;

      if (totalHours < 24 && 24 % totalHours === 0) {
        return `0 0 */${totalHours} * * *`;
      }

      if (totalHours === 24) {
        return "0 0 0 * * *";
      }
    }
  }

  return null;
}

export class IntervalWorkerScheduler implements WorkerScheduler {
  constructor(
    private readonly startWorker: () => void,
    private readonly stopWorker: () => void,
  ) {}

  async start() {
    this.startWorker();
  }

  async stop() {
    this.stopWorker();
  }
}

export class PgBossWorkerScheduler implements WorkerScheduler {
  private started = false;

  constructor(
    private readonly boss: BossLike,
    private readonly worker: WorkerRunner,
    private readonly pollIntervalMs: number,
    private readonly logger: LoggerLike = console,
  ) {}

  async start() {
    if (this.started) {
      return;
    }

    const cron = buildTrackingScheduleCron(this.pollIntervalMs);
    if (!cron) {
      throw new Error(
        `WORKER_POLL_INTERVAL_MS=${this.pollIntervalMs} cannot be represented as a pg-boss cron schedule`,
      );
    }

    this.boss.on("error", (error) => {
      this.logger.error(error);
    });

    await this.boss.start();

    const queue = await this.boss.getQueue(TRACK_DEPLOYMENTS_QUEUE);
    if (!queue) {
      await this.boss.createQueue(TRACK_DEPLOYMENTS_QUEUE, {
        policy: "exclusive",
        retryLimit: 0,
        deleteAfterSeconds: 300,
      });
    } else if (queue.policy && queue.policy !== "exclusive") {
      this.logger.warn(
        `Queue ${TRACK_DEPLOYMENTS_QUEUE} already exists with policy ${queue.policy}; leaving it unchanged`,
      );
    }

    await this.boss.schedule(
      TRACK_DEPLOYMENTS_QUEUE,
      cron,
      { kind: "track-pending-deployments" },
      { key: TRACK_DEPLOYMENTS_SCHEDULE_KEY },
    );

    await this.boss.work(
      TRACK_DEPLOYMENTS_QUEUE,
      {
        pollingIntervalSeconds: 1,
        batchSize: 1,
      },
      async () => {
        await this.worker.runOnce();
      },
    );

    this.started = true;
  }

  async stop() {
    if (!this.started) {
      return;
    }

    await this.boss.stop({
      graceful: true,
      timeout: 10_000,
    });
    this.started = false;
  }
}

export function createPgBossWorkerScheduler(
  databaseUrl: string,
  worker: WorkerRunner,
  pollIntervalMs: number,
  logger: LoggerLike = console,
): PgBossWorkerScheduler {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    application_name: "launchpad-worker",
  });

  return new PgBossWorkerScheduler(boss, worker, pollIntervalMs, logger);
}
