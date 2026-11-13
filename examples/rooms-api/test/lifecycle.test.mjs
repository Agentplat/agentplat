import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { closeHttpServer, runCoordinationWorker } from "../src/lifecycle.mjs";

test("shutdown has a deadline even when an HTTP request never completes", async () => {
  const server = createServer(() => {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const socket = connect(server.address().port, "127.0.0.1");
  await once(socket, "connect");
  const request = once(server, "request");
  socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
  await request;
  try {
    await closeHttpServer(server, 30);
  } finally {
    socket.destroy();
  }
  assert.equal(server.listening, false);
});

test("coordination resumes after transient database connection failure", async () => {
  const abort = new AbortController();
  let starts = 0;
  const retries = [];
  await runCoordinationWorker(
    {
      async start() {
        if (++starts === 1)
          throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" });
        abort.abort();
      },
    },
    abort.signal,
    (code) => retries.push(code),
  );
  assert.equal(starts, 2);
  assert.deepEqual(retries, ["ECONNREFUSED"]);
});

test("abort interrupts retry delay and configuration failures are not retried", async () => {
  const abort = new AbortController();
  await runCoordinationWorker(
    {
      async start() {
        throw Object.assign(new Error(), { code: "57P01" });
      },
    },
    abort.signal,
    () => abort.abort(),
  );
  await assert.rejects(
    runCoordinationWorker(
      {
        async start() {
          throw Object.assign(new Error(), { code: "VALIDATION_ERROR" });
        },
      },
      new AbortController().signal,
      () => assert.fail("must not retry"),
    ),
    { code: "VALIDATION_ERROR" },
  );
});
