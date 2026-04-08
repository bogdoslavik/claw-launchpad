const redactedLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.telegramBotToken",
  "req.body.openRouterApiKey",
  "req.body.token",
  "req.body.accessToken",
  "req.body.refreshToken",
  "res.headers.set-cookie",
] as const;

export function buildFastifyLoggerOptions(config: { logLevel: string }) {
  return {
    level: config.logLevel,
    base: {
      service: "launchpad-api",
    },
    redact: {
      paths: [...redactedLogPaths],
      censor: "[REDACTED]",
    },
  };
}

export { redactedLogPaths };
