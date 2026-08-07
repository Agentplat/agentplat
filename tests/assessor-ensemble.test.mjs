import assert from "node:assert/strict";
import test from "node:test";
import {
  HeterogeneousAssessorEnsembleRuntimeV1,
  InMemoryAssessorEnsembleStateStoreV1,
  createAssessorEnsembleMemberDescriptorV1,
  createAssessorEnsemblePolicyV1,
  createAssessorEnsembleVoteV1,
  digestAssessorEnsembleV1,
} from "../packages/inference-control/dist/assessor-ensemble.js";

const digest = (domain, value) => digestAssessorEnsembleV1(domain, value);
const policy = (overrides = {}) =>
  createAssessorEnsemblePolicyV1({
    schemaVersion: 1,
    policyId: "policy:ensemble",
    policyVersion: 1,
    minimumVotes: 2,
    minimumIndependenceGroups: 2,
    requiredSurfaces: ["input", "tool", "action"],
    requiredModalities: ["text"],
    assessorTimeoutMs: 20,
    maximumMembers: 8,
    maximumCasAttempts: 4,
    maximumStep: 10_100,
    maximumLogicalTimeMs: 100_000,
    ...overrides,
  });
const member = (id, group, decision = "allow", extra = {}) => {
  const descriptor = createAssessorEnsembleMemberDescriptorV1({
    schemaVersion: 1,
    assessorId: id,
    assessorVersion: 1,
    assessorImplementationDigest: digest("implementation", { id }),
    independenceGroup: group,
    agentClass: "portable_agent",
    surfaces: ["input", "output", "token", "tool", "action", "sidecar"],
    modalities: ["text", "image", "sensor"],
    ...extra,
  });
  return {
    descriptor,
    assess: async (request) =>
      createAssessorEnsembleVoteV1({
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        assessorId: descriptor.assessorId,
        assessorVersion: descriptor.assessorVersion,
        assessorImplementationDigest: descriptor.assessorImplementationDigest,
        independenceGroup: descriptor.independenceGroup,
        decision,
        reasonCodes: [],
        evidenceDigests: [],
      }),
  };
};
const request = (step, extra = {}) => ({
  invocationId: `invocation:${step}`,
  signalDigest: digest("signal", { step }),
  executionDomain: "inference",
  surface: "input",
  modalities: ["text"],
  step,
  logicalTimeMs: step,
  ...extra,
});
const runtime = (members, overrides = {}) =>
  new HeterogeneousAssessorEnsembleRuntimeV1({
    bindingDigest: digest("binding", { v: 1 }),
    policy: policy(overrides),
    members,
  });

test("heterogeneous members reach a deterministic content-free quorum", async () => {
  const first = runtime([
    member("assessor:a", "group:a"),
    member("assessor:b", "group:b"),
  ]);
  const second = runtime([
    member("assessor:b", "group:b"),
    member("assessor:a", "group:a"),
  ]);
  const one = await first.assess(
    request(1, { modalities: ["text", "image", "sensor"] }),
  );
  const two = await second.assess(
    request(1, { modalities: ["text", "image", "sensor"] }),
  );
  assert.equal(one.verdict.decision, "allow");
  assert.equal(one.verdict.verdictDigest, two.verdict.verdictDigest);
  assert.equal(one.state.lastInvocation.verdict.votes.length, 2);
});

test("all declared evaluator classes negotiate the same closed modality vocabulary", () => {
  const classes = [
    "opaque_api_model",
    "token_stream_model",
    "representation_sidecar_model",
    "portable_agent",
    "multimodal_action_agent",
  ];
  for (const [index, agentClass] of classes.entries()) {
    const descriptor = member(
      `assessor:class:${index}`,
      `group:${index}`,
      "allow",
      { agentClass },
    ).descriptor;
    assert.deepEqual(descriptor.modalities, ["image", "sensor", "text"]);
  }
});

test("same independence group cannot form a quorum", async () => {
  const result = await runtime([
    member("assessor:a", "shared"),
    member("assessor:b", "shared"),
  ]).assess(request(1));
  assert.equal(result.verdict.decision, "unresolved");
  assert.equal(result.verdict.countedIndependenceGroups.length, 1);
});

test("conflicting votes inside one independence group never select a convenient vote", async () => {
  const result = await runtime([
    member("assessor:a1", "group:a", "allow"),
    member("assessor:a2", "group:a", "block"),
    member("assessor:b", "group:b", "allow"),
  ]).assess(request(1));
  assert.equal(result.verdict.decision, "unresolved");
});

test("votes are request-bound and cannot be replayed into the next invocation", async () => {
  const replaying = member("assessor:a", "group:a");
  let retained;
  replaying.assess = async (current) => {
    retained ??= createAssessorEnsembleVoteV1({
      schemaVersion: 1,
      requestDigest: current.requestDigest,
      assessorId: replaying.descriptor.assessorId,
      assessorVersion: replaying.descriptor.assessorVersion,
      assessorImplementationDigest:
        replaying.descriptor.assessorImplementationDigest,
      independenceGroup: replaying.descriptor.independenceGroup,
      decision: "allow",
      reasonCodes: [],
      evidenceDigests: [],
    });
    return retained;
  };
  const controlled = runtime([replaying, member("assessor:b", "group:b")]);
  assert.equal((await controlled.assess(request(1))).verdict.decision, "allow");
  assert.equal(
    (await controlled.assess(request(2))).verdict.decision,
    "unresolved",
  );
});

test("timeouts, invalid votes, and disagreement resolve without allowing", async () => {
  const slow = member("assessor:slow", "group:a");
  slow.assess = async () => new Promise(() => {});
  const timeout = await runtime([slow, member("assessor:b", "group:b")], {
    assessorTimeoutMs: 1,
  }).assess(request(1));
  assert.equal(timeout.verdict.decision, "unresolved");
  const disagree = await runtime([
    member("assessor:a", "group:a", "allow"),
    member("assessor:b", "group:b", "block"),
  ]).assess(request(1));
  assert.equal(disagree.verdict.decision, "unresolved");
  const invalid = member("assessor:a", "group:a");
  invalid.assess = async () => ({ broken: true });
  const bad = await runtime([invalid, member("assessor:b", "group:b")]).assess(
    request(1),
  );
  assert.equal(bad.verdict.decision, "unresolved");
});

test("coverage is checked for required surfaces and modalities", async () => {
  const noSensor = member("assessor:a", "group:a", "allow", {
    modalities: ["text"],
  });
  const noAction = member("assessor:b", "group:b", "allow", {
    surfaces: ["input", "tool"],
    modalities: ["text"],
  });
  const result = await runtime([noSensor, noAction], {
    requiredModalities: ["text", "image", "sensor"],
  }).assess(request(1));
  assert.equal(result.verdict.coverageComplete, false);
  assert.equal(result.verdict.decision, "unresolved");
});

test("operation adapter fails closed for modify, block, unresolved and binding mismatch", async () => {
  const modify = runtime([
    member("assessor:a", "group:a", "modify"),
    member("assessor:b", "group:b", "modify"),
  ]);
  const result = await modify.gateOperation({
    invocationId: "tool:1",
    bindingDigest: digest("binding", { v: 1 }),
    signalDigest: digest("tool", {}),
    kind: "tool",
    modalities: ["text"],
    step: 1,
    logicalTimeMs: 1,
  });
  assert.equal(result.verdict.decision, "modify");
  assert.equal(result.allowed, false);
  await assert.rejects(
    modify.gateOperation({
      invocationId: "tool:2",
      bindingDigest: digest("binding", { v: 2 }),
      signalDigest: digest("tool", {}),
      kind: "tool",
      modalities: ["text"],
      step: 2,
      logicalTimeMs: 2,
    }),
    /binding_mismatch/,
  );
});

test("CAS state rejects replay, preserves terminal idempotency, and detects rollback", async () => {
  const store = new InMemoryAssessorEnsembleStateStoreV1();
  const options = {
    bindingDigest: digest("binding", { v: 1 }),
    policy: policy(),
    members: [member("assessor:a", "group:a"), member("assessor:b", "group:b")],
    store,
  };
  const controlled = new HeterogeneousAssessorEnsembleRuntimeV1(options);
  const first = await controlled.assess(request(2));
  assert.equal(
    (await controlled.assess(request(2))).verdict.verdictDigest,
    first.verdict.verdictDigest,
  );
  await assert.rejects(controlled.assess(request(1)), /replay_or_bound/);
  const key = `assessor-ensemble:${options.bindingDigest}`;
  const saved = await store.read(key);
  const stale = { ...saved, revision: 0 };
  await store.compareAndSet({
    stateKey: key,
    expectedRevision: saved.revision,
    expectedStateDigest: saved.stateDigest,
    next: stale,
  });
  await assert.rejects(
    controlled.assess(request(3)),
    /state_invalid|rollback_detected/,
  );
});

test("an exact retry resumes an interrupted prepared invocation", async () => {
  const underlying = new InMemoryAssessorEnsembleStateStoreV1();
  let writes = 0;
  let interruptFinish = true;
  const store = {
    read: (key) => underlying.read(key),
    readAnchor: (key) => underlying.readAnchor(key),
    compareAndSet: async (input) => {
      writes += 1;
      if (interruptFinish && writes === 2) {
        interruptFinish = false;
        return false;
      }
      return underlying.compareAndSet(input);
    },
  };
  const controlled = new HeterogeneousAssessorEnsembleRuntimeV1({
    bindingDigest: digest("binding", { interrupted: true }),
    policy: policy(),
    members: [member("assessor:a", "group:a"), member("assessor:b", "group:b")],
    store,
    monotonicAnchor: store,
  });
  await assert.rejects(controlled.assess(request(1)), /finish_conflict/u);
  const resumed = await controlled.assess(request(1));
  assert.equal(resumed.verdict.decision, "allow");
  assert.equal(resumed.state.activeInvocation, null);
});

test("bounded adversarial schedule stays deterministic for 10,000 steps", async () => {
  const controlled = runtime(
    [
      member("assessor:a", "group:a"),
      member("assessor:b", "group:b"),
      member("assessor:c", "group:c"),
    ],
    { maximumStep: 10_000 },
  );
  let last = "";
  for (let step = 1; step <= 10_000; step++) {
    const result = await controlled.assess(
      request(step, {
        modalities: step % 3 === 0 ? ["text", "image", "sensor"] : ["text"],
      }),
    );
    assert.equal(result.verdict.decision, "allow");
    last = result.state.stateDigest;
  }
  assert.match(last, /^sha256:[0-9a-f]{64}$/);
});
