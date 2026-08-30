import assert from "node:assert/strict";
import test from "node:test";

import { HttpMorphogenesisRollbackWitnessV1 } from "../dist/morphogenesis-http-witness.js";

const sha = (character) => `sha256:${character.repeat(64)}`;
const verifyInput = {
  scopeId: "tenant:a:mission:b",
  stateKind: "morphogenesis-execution",
  stateKey: "execution:test",
  revision: 3,
  digest: sha("a"),
};
const recordInput = {
  scopeId: "tenant:a:mission:b",
  stateKind: "morphology-head",
  stateKey: "head:test",
  previousRevision: 2,
  previousDigest: sha("b"),
  nextRevision: 3,
  nextDigest: sha("c"),
};

test("HTTPS witness binds accepted verify and record responses to request and head", async () => {
  const authorizations = [];
  const witness = new HttpMorphogenesisRollbackWitnessV1({
    endpoint: "https://witness.invalid/agentplat/",
    authorizationHeader: async () => "Bearer external-identity-token",
    fetch: async (request, init) => {
      authorizations.push(init.headers.authorization);
      const body = JSON.parse(init.body);
      const head = body.operation === "verify"
        ? { revision: body.input.revision, digest: body.input.digest }
        : { revision: body.input.nextRevision, digest: body.input.nextDigest };
      assert.equal(request.pathname, `/agentplat/v1/${body.operation}`);
      return Response.json({
        schemaVersion: 1,
        kind: `agentplat-morphogenesis-rollback-witness-${body.operation}-response-v1`,
        requestDigest: body.requestDigest,
        accepted: true,
        head,
      });
    },
  });
  assert.equal(await witness.verify(verifyInput), true);
  assert.equal(await witness.record(recordInput), true);
  assert.deepEqual(authorizations, [
    "Bearer external-identity-token",
    "Bearer external-identity-token",
  ]);
});

test("HTTPS witness fails closed on rejection, replay and divergent accepted head", async () => {
  const response = (change) => new HttpMorphogenesisRollbackWitnessV1({
    endpoint: "https://witness.invalid",
    fetch: async (_request, init) => {
      const body = JSON.parse(init.body);
      return Response.json(change({
        schemaVersion: 1,
        kind: "agentplat-morphogenesis-rollback-witness-verify-response-v1",
        requestDigest: body.requestDigest,
        accepted: true,
        head: { revision: body.input.revision, digest: body.input.digest },
      }));
    },
  });
  assert.equal(
    await response((value) => ({ ...value, accepted: false, head: null })).verify(verifyInput),
    false,
  );
  await assert.rejects(
    response((value) => ({ ...value, requestDigest: sha("f") })).verify(verifyInput),
    /response binding is invalid/,
  );
  await assert.rejects(
    response((value) => ({ ...value, head: { ...value.head, digest: sha("d") } })).verify(verifyInput),
    /accepted a divergent head/,
  );
});

test("HTTPS witness rejects unsafe endpoints and discontinuous records before I/O", async () => {
  assert.throws(
    () => new HttpMorphogenesisRollbackWitnessV1({ endpoint: "http://witness.invalid" }),
    /credential-free HTTPS/,
  );
  let calls = 0;
  const witness = new HttpMorphogenesisRollbackWitnessV1({
    endpoint: "https://witness.invalid",
    fetch: async () => { calls += 1; return Response.json({}); },
  });
  await assert.rejects(
    witness.record({ ...recordInput, nextRevision: 5 }),
    /revision is discontinuous/,
  );
  assert.equal(calls, 0);
});
