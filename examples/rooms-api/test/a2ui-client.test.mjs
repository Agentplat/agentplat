import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Minimal DOM boundary: execute the unmodified browser client and control network
// completion order. Real Chrome + PostgreSQL qualification is recorded separately.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.value = "";
    this.listeners = {};
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes.flatMap((n) =>
      n.tag === "fragment" ? n.children : [n],
    );
  }
  setAttribute() {}
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  querySelectorAll(tag) {
    return this.children.flatMap((n) => [
      ...(n.tag === tag ? [n] : []),
      ...n.querySelectorAll(tag),
    ]);
  }
  querySelector(tag) {
    return this.querySelectorAll(tag)[0];
  }
}
const surface = (id) => ({
  version: "1.0",
  createSurface: {
    surfaceId: id,
    catalogId: "agentplat:experimental:proposal-review:v1",
    components: [
      { id: "root", component: "Column", children: ["content", "approve"] },
      { id: "content", component: "Text", text: "<script>inert</script>" },
      {
        id: "approve",
        component: "Decision",
        label: "approve",
        decision: "approve",
      },
    ],
  },
});
const snapshot = (cursor, ids = ["one"]) => ({
  cursor,
  surfaces: ids.map(surface),
});
const ok = (data) => ({ ok: true, json: async () => ({ data }) });
async function harness() {
  const form = new Element("form"),
    output = new Element("main"),
    status = new Element("status"),
    decision = new Element("decision");
  const fields = { room: "room", token: "first-token" },
    calls = [],
    timers = new Map();
  let nextTimer = 0;
  let respond = async () => ok(snapshot("v1"));
  const source = await readFile(
    new URL("../src/a2ui/client.js", import.meta.url),
    "utf8",
  );
  runInNewContext(source, {
    document: {
      querySelector: (selector) =>
        ({
          form,
          main: output,
          "[role=status]": status,
          "#decision-status": decision,
        })[selector],
      createElement: (tag) => new Element(tag),
      createDocumentFragment: () => new Element("fragment"),
    },
    FormData: class {
      get(key) {
        return fields[key];
      }
    },
    AbortSignal,
    setTimeout(fn) {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fetch: (url, options) => {
      calls.push({ url, options });
      return respond(url, options);
    },
  });
  return {
    form,
    output,
    status,
    decision,
    fields,
    calls,
    respond(fn) {
      respond = fn;
    },
    submit: () => form.listeners.submit({ preventDefault() {} }),
    async poll() {
      const [id, fn] = [...timers][0];
      timers.delete(id);
      await fn();
    },
  };
}

test("reconnecting with a different credential rebuilds handlers even for an identical snapshot", async () => {
  const f = await harness();
  await f.submit();
  const oldButton = f.output.querySelector("button");
  const comment = f.output.querySelector("textarea");
  comment.value = "Keep this draft";
  comment.listeners.input();
  f.fields.token = "second-token";
  await f.submit();
  assert.equal(f.output.querySelector("textarea").value, "Keep this draft");
  assert.notEqual(f.output.querySelector("button"), oldButton);
  const count = f.calls.length;
  await oldButton.onclick();
  assert.equal(f.calls.length, count, "superseded handlers must be inert");
  f.respond(async (_url, options) =>
    options.method === "POST"
      ? ok({ status: "approved", targetVersion: 1 })
      : ok(snapshot("v1")),
  );
  await f.output.querySelector("button").onclick();
  assert.equal(
    f.calls.find((c) => c.options.method === "POST").options.headers
      .Authorization,
    "Bearer second-token",
  );
  assert.match(f.decision.textContent, /approved.*version 1/);
  assert.equal(f.output.querySelector("button").disabled, false);
  assert.ok(f.calls.every((c) => c.options.signal instanceof AbortSignal));
});

test("polling changes preserve drafts and superseded request failures cannot replace current status", async () => {
  const f = await harness();
  await f.submit();
  const comment = f.output.querySelector("textarea");
  comment.value = "Review in progress";
  comment.listeners.input();
  f.respond(async () => ok(snapshot("v2", ["one", "two"])));
  await f.poll();
  assert.equal(f.output.querySelector("textarea").value, "Review in progress");
  let rejectOld;
  f.respond(
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  const oldPoll = f.poll();
  f.respond(async (_url, options) =>
    options.method === "POST"
      ? ok({ status: "approved", targetVersion: 1 })
      : ok(snapshot("v3", [])),
  );
  await f.output.querySelector("button").onclick();
  rejectOld(new Error("old outage"));
  await oldPoll;
  assert.match(f.status.textContent, /Connected. No pending/);
});

test("failed reconnect clears stale actionable content and a failed decision can be retried", async () => {
  const f = await harness();
  await f.submit();
  f.respond(async () => {
    throw new Error("offline");
  });
  await f.output.querySelector("button").onclick();
  assert.equal(f.output.querySelector("button").disabled, false);
  assert.equal(f.output.querySelector("textarea").disabled, false);
  f.fields.token = "invalid";
  await f.submit();
  assert.equal(f.output.querySelectorAll("button").length, 0);
  assert.match(f.status.textContent, /Disconnected/);
});
