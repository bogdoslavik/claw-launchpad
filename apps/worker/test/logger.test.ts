import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkerLogger } from "../src/logger.js";

describe("createWorkerLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits JSON logs at or above the configured level", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createWorkerLogger("launchpad-worker", "info");

    logger.debug("hidden");
    logger.info("started", { mode: "interval" });

    expect(logSpy).toHaveBeenCalledOnce();
    const firstCall = logSpy.mock.calls[0]?.[0];
    expect(typeof firstCall).toBe("string");
    expect(JSON.parse(String(firstCall))).toMatchObject({
      level: "info",
      service: "launchpad-worker",
      message: "started",
      context: {
        mode: "interval",
      },
    });
  });

  it("sends errors to stderr", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createWorkerLogger("launchpad-worker", "info");

    logger.error(new Error("boom"));

    expect(errorSpy).toHaveBeenCalledOnce();
    const firstCall = errorSpy.mock.calls[0]?.[0];
    expect(JSON.parse(String(firstCall))).toMatchObject({
      level: "error",
      service: "launchpad-worker",
      error: {
        message: "boom",
      },
    });
  });
});
