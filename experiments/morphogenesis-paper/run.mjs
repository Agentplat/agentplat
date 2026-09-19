import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMorphogenesisExampleScenario } from '../../examples/agent-morphogenesis/demo.mjs';
import {
  InMemoryMorphogenesisExecutionStoreV1, InMemoryMorphologyHeadStoreV1,
  MorphologyHeadRuntimeV1, MorphologyHeadMorphogenesisActivationPortV1,
  createInitialMorphologyHeadV1,
} from '../../packages/collective-runtime/dist/morphogenesis.js';
import { RoomService, InMemoryRoomRepository } from '../../packages/rooms/dist/index.js';
import { InMemoryEventBus } from '../../packages/events/dist/index.js';
import { createMockRuntime } from '../../packages/runtime-mock/dist/index.js';
import { projectMorphogenesisReceiptToRoomArtifactV1 } from '../../packages/rooms-mesh/dist/morphogenesis.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sha = c => `sha256:${c.repeat(64)}`;
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const lines = file => existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
function append(file, value) {
  const fd = openSync(file, 'a');
  try { appendFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
}
function write(file, value) { writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

// One worker owns each journal. Reuse the production reference validator/CAS.
class ReplayStore {
  constructor(file, Store) { this.file = file; this.Store = Store; }
  async restore() {
    const store = new this.Store();
    for (const input of lines(this.file)) assert.equal(await store.save(input), true);
    return store;
  }
  async load(key) { return (await this.restore()).load(key); }
  async save(input) {
    const accepted = await (await this.restore()).save(input);
    if (accepted) append(this.file, input);
    return accepted;
  }
}

async function fixture(dependencies, driver) {
  const stop = new Error('pilot fixture finished');
  let result;
  try {
    await runMorphogenesisExampleScenario('recruit', 'authorized_agent', {
      ...dependencies,
      async directExecutionDriver(input) { result = await driver(input); throw stop; },
    });
  } catch (e) { if (e !== stop) throw e; }
  return result;
}

async function ready(runtime, stateKey) {
  let record = await runtime.required(stateKey);
  if (record.phase === 'prepared') record = await runtime.resolveAgent({stateKey, logicalTimeMs: 180});
  if (record.phase === 'agent_ready') record = await runtime.attest({stateKey, logicalTimeMs: 190});
  if (record.phase === 'attested') record = await runtime.verifyEnrollment({stateKey, logicalTimeMs: 195});
  return record;
}

async function worker(dir, condition, scenario, leg) {
  const executionStore = new ReplayStore(path.join(dir, `execution-${condition === 'fresh-id' ? leg : 'stable'}.jsonl`), InMemoryMorphogenesisExecutionStoreV1);
  const headStore = new ReplayStore(path.join(dir, 'head.jsonl'), InMemoryMorphologyHeadStoreV1);
  const heads = new MorphologyHeadRuntimeV1({store: headStore, maximumCommitAttempts: 4});
  const sink = path.join(dir, 'sink.jsonl');
  const ownerCalls = path.join(dir, 'owner-calls.jsonl');
  const key = `execution:${condition === 'fresh-id' ? leg : 'stable'}`;
  const result = await fixture({
    executionStore, resumeExisting: true, executionStateKey: key,
    async transformExecutionOptions({options}) {
      const teams = {
        async activateSuccessor(input) {
          append(ownerCalls, {kind: 'execute', operationId: input.operationId, pid: process.pid});
          if (scenario === 'stale-owner') throw new Error('owner mandate revoked');
          const existing = lines(sink).find(e => e.operationId === input.operationId);
          if (existing) return existing.receipt;
          const receipt = await options.teams.activateSuccessor(input);
          append(sink, {operationId: input.operationId, semanticTarget: 'team:recruit', receipt, pid: process.pid});
          if (['lost-ack', 'owner-unavailable'].includes(scenario) && leg === 'first') {
            process.kill(process.pid, 'SIGKILL');
          }
          return receipt;
        },
        async reconcileActivation(input) {
          append(ownerCalls, {kind: 'reconcile', operationId: input.operationId, pid: process.pid});
          if (scenario === 'owner-unavailable' && leg === 'second') return null;
          return lines(sink).find(e => e.operationId === input.operationId)?.receipt ?? null;
        },
      };
      return {...options, teams, morphology: new MorphologyHeadMorphogenesisActivationPortV1(heads)};
    },
  }, async ({runtime, execution, options}) => {
    const record = await ready(runtime, execution.stateKey);
    if (!(await headStore.load(record.morphologyHeadStateKey))) {
      await heads.initialize(createInitialMorphologyHeadV1({
        stateKey: record.morphologyHeadStateKey, scopeDigest: record.scope.scopeDigest,
        policyDigest: sha('a'), morphologyEpoch: 1, snapshotDigest: sha('1'), logicalTimeMs: 160,
      }));
    }
    let repository, service, room, artifact;
    if (scenario === 'room') {
    let sequence = 0;
    repository = new InMemoryRoomRepository();
    service = new RoomService({repository, eventPublisher: new InMemoryEventBus(), runtime: createMockRuntime(),
      idGenerator: () => `pilot-${++sequence}`, clock: () => new Date('2026-09-19T12:00:00Z')});
    room = await service.createRoom(record.scope.tenantId, {id: record.scope.roomId, title: 'Proposal Room', goal: 'Retain reviewed proposal work'});
    artifact = await service.createArtifact(room.tenantId, room.id, {type: 'analysis', title: 'Existing work', content: 'Reviewed analysis', contentType: 'text/plain'});
    artifact = (await repository.getRoomState(room.tenantId, room.id)).artifacts.find(a => a.id === artifact.id);
    }
    if (condition === 'durable-pattern') {
      const journal = path.join(dir, 'comparator.jsonl');
      const history = lines(journal);
      const input = {operationId: 'comparator:activate-team', scope: record.scope,
        proposalDigest: record.proposalDigest, positionDigest: record.positionDigest,
        agent: record.agent, attestation: record.attestation, logicalTimeMs: 200};
      let receipt = history.find(e => e.kind === 'receipt')?.receipt;
      if (!receipt && history.length) receipt = await options.teams.reconcileActivation(input);
      if (!receipt && history.length) return {status: 'blocked', pid: process.pid};
      if (!receipt) {
        append(journal, {kind: 'intent', input});
        receipt = await options.teams.activateSuccessor(input);
      }
      if (!history.some(e => e.kind === 'receipt')) append(journal, {kind: 'receipt', receipt});
      return {status: 'team-receipted', receiptDigest: receipt.receiptDigest, pid: process.pid};
    }
    if (scenario === 'stale-owner') {
      await assert.rejects(runtime.activateTeam({stateKey: key, logicalTimeMs: 200}), /owner mandate revoked/);
      return {status: 'owner-rejected', phase: (await runtime.required(key)).phase, pid: process.pid};
    }
    if (scenario === 'owner-unavailable' && leg === 'second') {
      // The V1 port reports unknown as null; runtime must reject, retaining intent.
      await assert.rejects(runtime.activateTeam({stateKey: key, logicalTimeMs: 200}));
      const retained = await runtime.required(key);
      assert.equal(retained.phase, 'activating_team');
      assert.equal(retained.activation, null);
      return {status: 'blocked', phase: retained.phase, pendingOperationId: retained.pendingOperation.operationId, pid: process.pid};
    }
    await runtime.activateTeam({stateKey: key, logicalTimeMs: 200});
    const beforeCommit = await headStore.load(record.morphologyHeadStateKey);
    assert.equal(beforeCommit.morphologyEpoch, 1);
    await runtime.commitMorphology({stateKey: key, logicalTimeMs: 210});
    await runtime.checkpoint({stateKey: key, logicalTimeMs: 220});
    if (scenario === 'premature-detach') {
      await assert.rejects(runtime.drain({stateKey: key, logicalTimeMs: 221}), /drain phase/);
      assert.equal((await runtime.required(key)).terminalAgent, null);
    }
    await runtime.fenceAuthority({stateKey: key, logicalTimeMs: 230});
    await runtime.drain({stateKey: key, logicalTimeMs: 240});
    await runtime.releaseBudget({stateKey: key, logicalTimeMs: 250});
    const completed = await runtime.complete({stateKey: key, disposition: 'success', outcomeEvidenceDigests: [sha('e')], logicalTimeMs: 260});
    write(path.join(dir, 'record.json'), completed);
    let roomObservation = null;
    if (scenario === 'room') {
      const projected = projectMorphogenesisReceiptToRoomArtifactV1({room, receipt: completed.receipt});
      const receiptArtifact = await service.createArtifact(room.tenantId, room.id, projected.input);
      const roomState = await repository.getRoomState(room.tenantId, room.id);
      const retained = roomState.artifacts.find(a => a.id === artifact.id);
      const retainedReceipt = roomState.artifacts.find(a => a.id === receiptArtifact.id);
      assert.deepEqual(retained, artifact);
      assert.equal(retainedReceipt.versions[0].content.receiptDigest, completed.receipt.receiptDigest);
      roomObservation = {roomId: room.id, artifactId: artifact.id, receiptArtifactId: receiptArtifact.id,
        retainedWorkArtifacts: 1, semanticValidityEvaluated: false, receiptDigest: completed.receipt.receiptDigest};
      write(path.join(dir, 'room.json'), {roomObservation, artifact, retained, receiptArtifact: retainedReceipt, retainedReceipt});
    }
    return {status: 'completed', phase: completed.phase, receiptDigest: completed.receipt.receiptDigest,
      headEpochBeforeCommit: beforeCommit.morphologyEpoch, roomObservation, pid: process.pid};
  });
  write(path.join(dir, `worker-${leg}.json`), result);
}

async function losingEffects(dir) {
  const store = new InMemoryMorphologyHeadStoreV1();
  const heads = new MorphologyHeadRuntimeV1({store, maximumCommitAttempts: 4});
  return fixture({}, async ({runtime, execution, options}) => {
    const record = await ready(runtime, execution.stateKey);
    const stateKey = 'head:competing';
    await heads.initialize(createInitialMorphologyHeadV1({stateKey, scopeDigest: record.scope.scopeDigest,
      policyDigest: sha('a'), morphologyEpoch: 1, snapshotDigest: sha('1'), logicalTimeMs: 160}));
    const activation = new MorphologyHeadMorphogenesisActivationPortV1(heads);
    const inputs = [];
    for (const [name, digest] of [['a', 'a'], ['b', 'b']]) {
      const team = await options.teams.activateSuccessor({operationId: `team:${name}`, agent: record.agent, logicalTimeMs: 200});
      inputs.push({operationId: `commit:${name}`, morphologyHeadStateKey: stateKey, scope: record.scope,
        expectedMorphologyEpoch: 1, proposalDigest: sha(digest), decisionDigest: sha(digest),
        resultingSnapshotDigest: sha(digest), team, logicalTimeMs: 210});
    }
    const settled = await Promise.allSettled(inputs.map(i => activation.activate(i)));
    assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
    const result = {scenario: 'losing-effects', effectCount: inputs.length,
      acceptedSuccessors: settled.filter(r => r.status === 'fulfilled').length,
      losingProposalEffects: 1, automaticallyCompensated: false,
      inputs, results: settled.map(r => r.status === 'fulfilled' ? {status: r.status, value: r.value} : {status: r.status, reason: r.reason.message}),
      head: await store.load(stateKey)};
    write(path.join(dir, 'losing-effects.json'), result);
    return result;
  });
}

function files(dir) { return readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }

async function main(output) {
  assert(!existsSync(output), 'output directory must not exist; failed runs are retained');
  mkdirSync(output, {recursive: true});
  const startedAt = new Date().toISOString();
  const outcomes = [];
  for (const condition of ['morphogenesis', 'fresh-id', 'durable-pattern']) {
    for (const scenario of ['nominal', 'lost-ack']) {
      outcomes.push(runCase(condition, scenario));
    }
  }
  for (const scenario of ['owner-unavailable', 'stale-owner', 'premature-detach', 'room']) outcomes.push(runCase('morphogenesis', scenario));
  const losing = await losingEffects(output);
  function runCase(condition, scenario) {
    const dir = path.join(output, `${condition}-${scenario}`);
    mkdirSync(dir);
    const legs = ['lost-ack', 'owner-unavailable'].includes(scenario) ? (scenario === 'owner-unavailable' ? ['first', 'second', 'third'] : ['first', 'second']) : ['first'];
    const workers = [];
    for (const leg of legs) {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', dir, condition, scenario, leg], {cwd: root, encoding: 'utf8', timeout: 30000,
        env: {PATH: process.env.PATH, LANG: 'en_US.UTF-8'}});
      writeFileSync(path.join(dir, `${leg}.stdout`), child.stdout ?? '');
      writeFileSync(path.join(dir, `${leg}.stderr`), child.stderr ?? '');
      const expectedKill = leg === 'first' && ['lost-ack', 'owner-unavailable'].includes(scenario);
      const status = {leg, exitCode: child.status, signal: child.signal, expectedKill, error: child.error?.message ?? null};
      workers.push(status);
      write(path.join(dir, 'workers.json'), workers);
      assert.equal(child.error, undefined, `${condition}/${scenario}/${leg}: worker failed`);
      if (expectedKill) assert.equal(child.signal, 'SIGKILL');
      else assert.equal(child.status, 0, child.stderr);
    }
    const effects = lines(path.join(dir, 'sink.jsonl'));
    const expectedEffects = scenario === 'stale-owner' ? 0 : condition === 'fresh-id' && scenario === 'lost-ack' ? 2 : 1;
    assert.equal(effects.length, expectedEffects);
    const outcome = {condition, scenario, effectCount: effects.length,
      duplicateSemanticEffects: Math.max(0, effects.length - 1), workers,
      lastWorker: json(path.join(dir, `worker-${legs.at(-1)}.json`))};
    write(path.join(dir, 'outcome.json'), outcome);
    return outcome;
  }
  const moduleFiles = files(path.join(root, 'packages')).filter(f => f.includes('/dist/') && f.endsWith('.js'));
  const sourceFiles = ['experiments/morphogenesis-paper/run.mjs', 'experiments/morphogenesis-paper/verify.mjs', 'experiments/morphogenesis-paper/protocol.md', 'examples/agent-morphogenesis/demo.mjs', 'pnpm-lock.yaml'];
  const manifest = {
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    trackedDiffDigest: hash(execFileSync('git', ['diff', 'HEAD', '--'], {cwd: root})),
    nodeVersion: process.version, platform: process.platform, arch: process.arch,
    evidenceClass: 'single-host synthetic-owner boundary pilot',
    externalSpendUsd: 0, modelCalls: 0, independentSamplesPerSchedule: 1,
    sourceFiles: sourceFiles.map(f => ({path: f, digest: hash(readFileSync(path.join(root, f)))})),
    compiledModules: moduleFiles.map(f => ({path: path.relative(root, f), digest: hash(readFileSync(f))})),
  };
  write(path.join(output, 'environment.json'), manifest);
  const summary = {caseCount: outcomes.length + 1, outcomes: outcomes.map(({workers, ...o}) => o),
    losingEffects: {effectCount: losing.effectCount, acceptedSuccessors: losing.acceptedSuccessors,
      losingProposalEffects: losing.losingProposalEffects, automaticallyCompensated: false},
    interpretation: 'Both stable-ID implementations recover one effect. Head CAS alone leaves a losing effect. No organizational utility or cross-framework superiority evaluated.'};
  write(path.join(output, 'summary.json'), summary);
  write(path.join(output, 'manifest.json'), files(output).sort().map(f => ({path: path.relative(output, f), digest: hash(readFileSync(f))})));
  console.log(JSON.stringify({output, caseCount: summary.caseCount, status: 'completed'}));
}

if (process.argv[2] === '--worker') await worker(...process.argv.slice(3));
else if (process.argv[2] === '--output' && process.argv[3]) await main(path.resolve(process.argv[3]));
else throw new Error('usage: node run.mjs --output <new-directory>');
