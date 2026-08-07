import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  GovernedMissionLifecycleRuntimeV1,
  InMemoryGovernedMissionStoreV1,
  governedMissionRequestDigestV1,
  governedMissionScopeDigestV1,
  governedMissionAuthorizationDigestV1,
  governedMissionControlProposalDigestV1,
  governedMissionStateDigestV1,
} from "../packages/collective-runtime/dist/mission-lifecycle.js";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const scope = (epoch = 1, fencingToken = "fence-1") => {
  const body = {
    tenantId: "tenant-1",
    missionId: "mission-1",
    missionIntentId: "intent-1",
    objectiveId: "objective-1",
    workItemId: "work-1",
    workItemRevision: 1,
    authorityId: "authority-1",
    authorityEpoch: epoch,
    fencingToken,
  };
  return { ...body, scopeDigest: governedMissionScopeDigestV1(body) };
};
const policy = (overrides = {}) => ({
  schemaVersion: 1,
  policyId: "policy-1",
  policyVersion: 1,
  policyDigest: digest("policy"),
  requestId: "request-1",
  planInputDigest: digest("plan"),
  budget: {
    maximumActionUnits: 8,
    maximumReconfigurations: 2,
    maximumCommitAttempts: 3,
    maximumTransitionsPerInvocation: 20,
    ...overrides,
  },
});
const request = (
  inputScope = scope(),
  time = 10,
  requestId = "request-1",
  planInputDigest = digest("plan"),
) => {
  const body = {
    schemaVersion: 1,
    requestId,
    scope: inputScope,
    policyDigest: digest("policy"),
    planInputDigest,
    logicalTimeMs: time,
  };
  return { ...body, requestDigest: governedMissionRequestDigestV1(body) };
};
function ports({
  controlAction = "continue",
  controlActions,
  deny = false,
  throwExecutionOnce = false,
  throwReconfigurationOnce = false,
  calls = [],
} = {}) {
  let throwOnce = throwExecutionOnce;
  let throwReconfiguration = throwReconfigurationOnce;
  let controlIndex = 0;
  const authorizations = new Map();
  return {
    authorization: {
      async authorize(input) {
        calls.push(`auth:${input.action}:${input.operationId}`);
        if (deny) return null;
        const body = {
          authorizationId: "authorization-1",
          action: input.action,
          operationId: input.operationId,
          intentDigest: input.intentDigest,
          scopeDigest: input.scope.scopeDigest,
          authorityEpoch: input.scope.authorityEpoch,
          fencingToken: input.scope.fencingToken,
          issuedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: input.logicalTimeMs + 100,
        };
        const record = {
          ...body,
          authorizationDigest: governedMissionAuthorizationDigestV1(body),
        };
        authorizations.set(record.authorizationDigest, record);
        return record;
      },
      async verify(input) {
        return authorizations.get(input.authorizationDigest) ?? null;
      },
    },
    decision: {
      async certifyPlan(input) {
        calls.push(`decision:${input.operation.operationId}`);
        return { decisionDigest: digest("decision") };
      },
    },
    allocation: {
      async activateAllocation(input) {
        calls.push(`allocation:${input.operation.operationId}`);
        return { allocationDigest: digest("allocation") };
      },
    },
    formation: {
      async activateTeam(input) {
        calls.push(`formation:${input.operation.operationId}`);
        return { teamDigest: digest("team") };
      },
    },
    execution: {
      async observeExecution(input) {
        calls.push(`execution:${input.operation.operationId}`);
        if (throwOnce) {
          throwOnce = false;
          throw new Error("simulated crash");
        }
        return { observationDigest: digest("observation") };
      },
    },
    control: {
      async evaluate(input) {
        calls.push("control");
        const action =
          controlActions?.[
            Math.min(controlIndex++, controlActions.length - 1)
          ] ?? controlAction;
        const body = {
          proposalId: `proposal-${controlIndex}`,
          scopeDigest: input.scope.scopeDigest,
          authorityEpoch: input.scope.authorityEpoch,
          action,
          evaluatedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: input.logicalTimeMs + 10,
          advisoryOnly: true,
        };
        return {
          ...body,
          proposalDigest: governedMissionControlProposalDigestV1(body),
        };
      },
    },
    reconfiguration: {
      async enact(input) {
        calls.push(
          `reconfigure:${input.operation.action}:${input.operation.operationId}`,
        );
        if (throwReconfiguration) {
          throwReconfiguration = false;
          throw new Error("simulated reconfiguration crash");
        }
        return { resultDigest: digest("reconfigured") };
      },
    },
  };
}
const runtime = (store, options = {}) =>
  new GovernedMissionLifecycleRuntimeV1({
    stateKey: "mission-state-1",
    policy: policy(options.budget),
    store,
    ports: options.ports ?? ports(options),
  });

test("advances one digest-only request through certified activation and authorized reconfiguration", async () => {
  const calls = [];
  const store = new InMemoryGovernedMissionStoreV1();
  const state = await runtime(store, {
    controlActions: ["request_role_transition", "continue"],
    calls,
  }).advance(request());
  assert.equal(state.phase, "completed");
  assert.equal(state.reconfigurationCount, 1);
  assert.deepEqual(
    calls
      .filter((value) => value.startsWith("auth:"))
      .map((value) => value.split(":")[1]),
    [
      "certify_plan",
      "activate_allocation",
      "activate_team",
      "observe_execution",
      "enact_role_transition",
      "observe_execution",
    ],
  );
  assert.equal(
    state.outbox.every((entry) => entry.status === "applied"),
    true,
  );
});

test("fails closed when approval is denied", async () => {
  await assert.rejects(
    runtime(new InMemoryGovernedMissionStoreV1(), { deny: true }).advance(
      request(),
    ),
    /authorization denied/,
  );
});

test("rejects stale advisory proposals before seeking reconfiguration authorization", async () => {
  const p = ports();
  p.control.evaluate = async (input) => {
    const body = {
      proposalId: "proposal-1",
      scopeDigest: input.scope.scopeDigest,
      authorityEpoch: input.scope.authorityEpoch,
      action: "request_replanning",
      evaluatedAtLogicalMs: input.logicalTimeMs - 2,
      expiresAtLogicalMs: input.logicalTimeMs,
      advisoryOnly: true,
    };
    return {
      ...body,
      proposalDigest: governedMissionControlProposalDigestV1(body),
    };
  };
  await assert.rejects(
    runtime(new InMemoryGovernedMissionStoreV1(), { ports: p }).advance(
      request(),
    ),
    /stale, expired, or out of scope/,
  );
});

test("recovers a prepared operation with its same id after a crash", async () => {
  const calls = [];
  const store = new InMemoryGovernedMissionStoreV1();
  const p = ports({ throwExecutionOnce: true, calls });
  await assert.rejects(
    runtime(store, { ports: p }).advance(request()),
    /simulated crash/,
  );
  const state = await runtime(store, { ports: p }).recover(request());
  assert.equal(state.phase, "completed");
  const executionCalls = calls.filter((value) =>
    value.startsWith("execution:"),
  );
  assert.equal(executionCalls.length, 2);
  assert.equal(executionCalls[0], executionCalls[1]);
});

test("CAS retry keeps a stable operation id", async () => {
  const base = new InMemoryGovernedMissionStoreV1();
  let failOnce = true;
  const calls = [];
  const store = {
    load: (...args) => base.load(...args),
    async save(input) {
      if (
        failOnce &&
        input.state.phase === "allocation" &&
        input.state.pendingOperation === null
      ) {
        failOnce = false;
        return false;
      }
      return base.save(input);
    },
  };
  const state = await runtime(store, { calls }).advance(request());
  assert.equal(state.phase, "completed");
  const ids = calls
    .filter((value) => value.startsWith("auth:certify_plan"))
    .map((value) => value.split(":").slice(2).join(":"));
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 1);
});

test("rejects changed fencing and enforces action budgets", async () => {
  const store = new InMemoryGovernedMissionStoreV1();
  const p = ports({ throwExecutionOnce: true });
  await assert.rejects(
    runtime(store, { ports: p }).advance(request()),
    /simulated crash/,
  );
  await assert.rejects(
    runtime(store, { ports: p }).recover(request(scope(2, "fence-2"))),
    /request, scope, epoch, or fencing binding changed/,
  );
  await assert.rejects(
    runtime(new InMemoryGovernedMissionStoreV1(), {
      budget: { maximumActionUnits: 3 },
    }).advance(request()),
    /action budget exhausted/,
  );
});

test("rejects request identity or plan-input substitution under the same scope", async () => {
  const store = new InMemoryGovernedMissionStoreV1();
  const p = ports({ throwExecutionOnce: true });
  await assert.rejects(
    runtime(store, { ports: p }).advance(request()),
    /simulated crash/,
  );
  await assert.rejects(
    runtime(store, { ports: p }).recover(request(scope(), 11, "request-2")),
    /policy\/request binding changed/,
  );
  await assert.rejects(
    runtime(store, { ports: p }).recover(
      request(scope(), 11, "request-1", digest("other-plan")),
    ),
    /policy\/request binding changed/,
  );
});

test("rejects a forged restored authorization and persists a durable pause", async () => {
  const store = new InMemoryGovernedMissionStoreV1();
  const p = ports({ controlActions: ["pause_dispatch", "continue"] });
  const paused = await runtime(store, { ports: p }).advance(request());
  assert.equal(paused.phase, "paused");
  const completed = await runtime(store, { ports: p }).advance(
    request(scope(), 11),
  );
  assert.equal(completed.phase, "completed");
  p.authorization.verify = async () => null;
  await assert.rejects(
    runtime(store, { ports: p }).recover(request(scope(), 12)),
    /retained authorization verification failed/,
  );
});

test("replanning clears downstream state and returns through planning", async () => {
  const calls = [];
  const state = await runtime(new InMemoryGovernedMissionStoreV1(), {
    controlActions: ["request_replanning", "continue"],
    calls,
    budget: { maximumActionUnits: 10 },
  }).advance(request());
  assert.equal(state.phase, "completed");
  assert.equal(
    calls.filter((value) => value.startsWith("decision:")).length,
    2,
  );
  assert.equal(
    calls.some((value) => value.includes("enact_replanning")),
    true,
  );
});

test("rejects a control proposal that expires while reconfiguration is pending", async () => {
  const calls = [];
  const store = new InMemoryGovernedMissionStoreV1();
  const p = ports({
    controlAction: "request_replanning",
    throwReconfigurationOnce: true,
    calls,
  });
  await assert.rejects(
    runtime(store, { ports: p }).advance(request()),
    /simulated reconfiguration crash/,
  );
  const before = calls.filter((value) =>
    value.startsWith("auth:enact_replanning"),
  ).length;
  await assert.rejects(
    runtime(store, { ports: p }).recover(request(scope(), 20)),
    /retained control proposal is stale, conflicting, or expired/,
  );
  assert.equal(
    calls.filter((value) => value.startsWith("auth:enact_replanning")).length,
    before,
  );
});

test("rejects restored control proposals with a different state scope or epoch", async () => {
  for (const mutation of ["scope", "epoch"]) {
    const store = mutableStore();
    const p = ports({
      controlAction: "request_replanning",
      throwReconfigurationOnce: true,
    });
    await assert.rejects(
      runtime(store, { ports: p }).advance(request()),
      /simulated reconfiguration crash/,
    );
    const state = store.current();
    const { proposalDigest: ignoredProposalDigest, ...proposalBody } =
      state.controlProposal;
    const changedProposalBody =
      mutation === "scope"
        ? { ...proposalBody, scopeDigest: digest("wrong-scope") }
        : {
            ...proposalBody,
            authorityEpoch: proposalBody.authorityEpoch + 1,
          };
    const controlProposal = {
      ...changedProposalBody,
      proposalDigest:
        governedMissionControlProposalDigestV1(changedProposalBody),
    };
    const { stateDigest: ignoredStateDigest, ...stateBody } = state;
    const changedStateBody = { ...stateBody, controlProposal };
    store.replace({
      ...changedStateBody,
      stateDigest: governedMissionStateDigestV1(changedStateBody),
    });
    await assert.rejects(
      runtime(store, { ports: p }).recover(request()),
      /control proposal state scope or epoch is invalid/,
    );
  }
});

test("policy validates and enforces request and plan-input bindings before creation", async () => {
  const store = new InMemoryGovernedMissionStoreV1();
  await assert.rejects(
    runtime(store).advance(request(scope(), 10, "request-2")),
    /policy\/request binding changed/,
  );
  await assert.rejects(
    runtime(store).advance(
      request(scope(), 10, "request-1", digest("substituted")),
    ),
    /policy\/request binding changed/,
  );
  assert.equal(await store.load("mission-state-1"), null);
  assert.throws(
    () =>
      new GovernedMissionLifecycleRuntimeV1({
        stateKey: "mission-state-1",
        policy: { ...policy(), requestId: " bad" },
        store,
        ports: ports(),
      }),
    /policy request ID is invalid/,
  );
  assert.throws(
    () =>
      new GovernedMissionLifecycleRuntimeV1({
        stateKey: "mission-state-1",
        policy: { ...policy(), planInputDigest: "invalid" },
        store,
        ports: ports(),
      }),
    /policy plan input digest must be a sha256 digest/,
  );
});

function mutableStore() {
  let state = null;
  return {
    async load() {
      return state;
    },
    async save(input) {
      if (state === null) {
        if (
          input.expectedRevision !== null ||
          input.expectedStateDigest !== null
        )
          return false;
      } else if (
        input.expectedRevision !== state.revision ||
        input.expectedStateDigest !== state.stateDigest
      )
        return false;
      state = input.state;
      return true;
    },
    current() {
      return state;
    },
    replace(value) {
      state = value;
    },
  };
}
