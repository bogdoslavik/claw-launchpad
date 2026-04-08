import { loadWorkerConfig } from "./config.js";
import { createPgBossWorkerScheduler, IntervalWorkerScheduler } from "./scheduler.js";
import { LaunchpadWorker } from "./worker.js";
import { buildWorkerDependencies } from "./runtime.js";

async function main() {
  const config = loadWorkerConfig();
  const worker = new LaunchpadWorker(
    buildWorkerDependencies({
      databaseUrl: config.DATABASE_URL,
      storePath: config.LAUNCHPAD_STORE_PATH,
    }),
    config.WORKER_POLL_INTERVAL_MS,
  );

  const scheduler =
    config.DATABASE_URL
      ? createPgBossWorkerScheduler(config.DATABASE_URL, worker, config.WORKER_POLL_INTERVAL_MS)
      : new IntervalWorkerScheduler(
          () => worker.start(),
          () => worker.stop(),
        );

  await scheduler.start();

  const shutdown = async () => {
    await scheduler.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
