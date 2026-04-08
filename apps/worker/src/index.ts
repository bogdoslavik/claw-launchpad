import { loadWorkerConfig } from "./config.js";
import { createWorkerLogger } from "./logger.js";
import { createPgBossWorkerScheduler, IntervalWorkerScheduler } from "./scheduler.js";
import { LaunchpadWorker } from "./worker.js";
import { buildWorkerDependencies } from "./runtime.js";

async function main() {
  const config = loadWorkerConfig();
  const logger = createWorkerLogger("launchpad-worker", config.LOG_LEVEL);
  const worker = new LaunchpadWorker(
    buildWorkerDependencies({
      databaseUrl: config.DATABASE_URL,
      storePath: config.LAUNCHPAD_STORE_PATH,
    }),
    config.WORKER_POLL_INTERVAL_MS,
  );

  const scheduler =
    config.DATABASE_URL
      ? createPgBossWorkerScheduler(config.DATABASE_URL, worker, config.WORKER_POLL_INTERVAL_MS, logger)
      : new IntervalWorkerScheduler(
          () => worker.start(),
          () => worker.stop(),
        );

  await scheduler.start();
  logger.info("Worker started", {
    mode: config.DATABASE_URL ? "pg_boss" : "interval",
    pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
  });

  const shutdown = async (signal: string) => {
    logger.info("Worker shutdown requested", { signal });
    await scheduler.stop();
    logger.info("Worker stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "fatal",
      service: "launchpad-worker",
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    }),
  );
  process.exitCode = 1;
});
