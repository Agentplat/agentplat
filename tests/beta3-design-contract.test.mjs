import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = {
  adr: "docs/adr/0009-adaptive-mission-runtime.md",
  plan: "docs/adaptive-mission/beta-3-implementation-plan.md",
  evaluation: "docs/adaptive-mission/evaluation-contract-v2.md",
  checklist: "docs/adaptive-mission/beta-3-acceptance-checklist.md",
  review: "docs/adaptive-mission/beta-3-design-review.md",
  threatModel: "docs/security/adaptive-mission-runtime-threat-model.md",
  releasePlan: "docs/agent-mesh/release-plan.md",
};

async function readDocuments() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(documents).map(async ([name, file]) => [
        name,
        await readFile(file, "utf8"),
      ]),
    ),
  );
}

test("Beta 3 design set freezes the additive compatibility boundary", async () => {
  const docs = await readDocuments();

  assert.match(docs.adr, /@agentplat\/collective-planning/u);
  assert.match(docs.adr, /changing `wireVersion: 1`/u);
  assert.match(docs.plan, /expected coordinated public package count: `37`/u);
  assert.match(docs.plan, /agentplat\.collective-planning\.fragment\.v1/u);
  assert.match(docs.plan, /No package code changes in this increment\./u);
  assert.match(
    docs.releasePlan,
    /\[Beta 3 design review\]\(\.\.\/adaptive-mission\/beta-3-design-review\.md\)/u,
  );
});

test("Beta 3 design keeps planning separate from effect authority", async () => {
  const docs = await readDocuments();

  assert.match(
    docs.plan,
    /No evaluation path may substitute a\s+direct array lookup or construct assignment authority\./u,
  );
  assert.match(docs.adr, /It is data, not authority\./u);
  assert.match(
    docs.threatModel,
    /planning data cannot create or widen authority/u,
  );
  assert.match(docs.evaluation, /direct-assignment/u);
  assert.match(docs.checklist, /Proposal\/role-as-authority/u);
});

test("Beta 3 design fails closed at planning ingress", async () => {
  const docs = await readDocuments();

  assert.match(
    docs.plan,
    /retain only the existing\s+non-evictable replay and message-ID high-waters/u,
  );
  assert.match(
    docs.plan,
    /commits no Objective, Work,\s+allocation, planning, role, budget or effect state/u,
  );
  assert.match(
    docs.checklist,
    /retains only required replay\/message-ID\s+high-waters/u,
  );
});

test("Beta 3 evaluation claims remain event-derived and falsifiable", async () => {
  const docs = await readDocuments();

  assert.match(docs.evaluation, /The invariant monitor alone sees:/u);
  assert.match(
    docs.evaluation,
    /`min\(1,000, 2N\)` event-derived interactions/u,
  );
  assert.match(
    docs.plan,
    /prebuilt task list, direct assignee lookup, direct Work\s+Contract construction, declared-only fault or synthetic metric invalidates the\s+sample/u,
  );
  assert.match(docs.checklist, /Synthetic-ledger padding\/omission/u);
});

test("Beta 3 design review has no open P0 through P2 findings", async () => {
  const { review } = await readDocuments();

  assert.match(review, /P0: 0\./u);
  assert.match(review, /P1: 0\./u);
  assert.match(review, /P2: 0\./u);
  assert.match(review, /B3-DR-001/u);
  assert.match(review, /B3-DR-010/u);
  assert.match(
    review,
    /public post-release evidence baseline:\s+`64478b1dce9f62544a865426faef710fa1f70f49`/u,
  );
});
