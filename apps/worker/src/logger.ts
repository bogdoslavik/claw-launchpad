const levelOrder = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
} as const;

export type WorkerLogLevel = keyof typeof levelOrder;

function normalizeLogPayload(message?: unknown, optionalParams: unknown[] = []) {
  const payload: Record<string, unknown> = {};

  if (typeof message === "string") {
    payload.message = message;
  } else if (message instanceof Error) {
    payload.error = {
      name: message.name,
      message: message.message,
      stack: message.stack,
    };
  } else if (message !== undefined) {
    payload.data = message;
  }

  if (optionalParams.length === 1 && optionalParams[0] && typeof optionalParams[0] === "object") {
    payload.context = optionalParams[0];
  } else if (optionalParams.length > 0) {
    payload.args = optionalParams;
  }

  return payload;
}

export function createWorkerLogger(service: string, level: WorkerLogLevel) {
  const minLevel = levelOrder[level];

  const write = (targetLevel: Exclude<WorkerLogLevel, "silent">, message?: unknown, ...optionalParams: unknown[]) => {
    if (levelOrder[targetLevel] < minLevel) {
      return;
    }

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: targetLevel,
      service,
      ...normalizeLogPayload(message, optionalParams),
    });

    if (targetLevel === "warn") {
      console.warn(line);
      return;
    }

    if (targetLevel === "error" || targetLevel === "fatal") {
      console.error(line);
      return;
    }

    console.log(line);
  };

  return {
    trace: (message?: unknown, ...optionalParams: unknown[]) => write("trace", message, ...optionalParams),
    debug: (message?: unknown, ...optionalParams: unknown[]) => write("debug", message, ...optionalParams),
    info: (message?: unknown, ...optionalParams: unknown[]) => write("info", message, ...optionalParams),
    warn: (message?: unknown, ...optionalParams: unknown[]) => write("warn", message, ...optionalParams),
    error: (message?: unknown, ...optionalParams: unknown[]) => write("error", message, ...optionalParams),
    fatal: (message?: unknown, ...optionalParams: unknown[]) => write("fatal", message, ...optionalParams),
  };
}
