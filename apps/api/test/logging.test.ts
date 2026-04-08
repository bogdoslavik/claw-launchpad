import { describe, expect, it } from "vitest";

import { buildFastifyLoggerOptions, redactedLogPaths } from "../src/logging.js";

describe("buildFastifyLoggerOptions", () => {
  it("keeps secret-bearing fields redacted", () => {
    expect(redactedLogPaths).toContain("req.headers.authorization");
    expect(redactedLogPaths).toContain("req.body.telegramBotToken");
    expect(redactedLogPaths).toContain("req.body.openRouterApiKey");
    expect(redactedLogPaths).toContain("req.body.token");
  });

  it("passes through the configured log level", () => {
    expect(buildFastifyLoggerOptions({ logLevel: "debug" })).toMatchObject({
      level: "debug",
      base: {
        service: "launchpad-api",
      },
      redact: {
        censor: "[REDACTED]",
      },
    });
  });
});
