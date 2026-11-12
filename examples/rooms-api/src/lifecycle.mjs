import { setTimeout as delay } from "node:timers/promises";

export async function runCoordinationWorker(worker, signal, onRetry) {
  while (!signal.aborted) {
    try {
      await worker.start(signal);
      return;
    } catch (error) {
      if (signal.aborted) return;
      const code = error.code ?? error.cause?.code;
      if (
        ![
          "ECONNREFUSED",
          "ECONNRESET",
          "ETIMEDOUT",
          "EPIPE",
          "57P01",
          "57P02",
          "57P03",
          "53300",
        ].includes(code) &&
        !String(code).startsWith("08")
      )
        throw error;
      onRetry(code);
      await delay(1000, undefined, { signal }).catch((error) => {
        if (error.name !== "AbortError") throw error;
      });
    }
  }
}

export async function closeHttpServer(server, graceMs = 5000) {
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => server.closeAllConnections(), graceMs);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      error ? reject(error) : resolve();
    });
    server.closeIdleConnections();
  });
}
