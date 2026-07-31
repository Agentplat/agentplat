import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestControlJsonV1 } from '../packages/inference-control/dist/index.js';

export const INFERENCE_CONTROL_SCENARIO_RELEASE_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const descriptor = Object.freeze({
  schemaVersion: 1,
  capabilityId: 'capability:alpha3-scenarios',
  descriptorVersion: 1,
  inputInspection: 'full',
  finalOutputAssessment: 'full',
  incrementalOutputAssessment: 'windowed',
  releaseInterruption: 'local',
  toolInterception: 'all',
  messageInterception: 'application_only',
  representationAccess: 'none',
  declarationSource: 'wrapper',
  assurance: 'reference_tested',
  wrapperId: 'wrapper:alpha3-scenarios',
  wrapperVersion: 1,
});

const definitions = [
  [
    '01',
    'hostile-context-is-data',
    'tests/inference-control-model-runtime.test.mjs',
    'model renderer keeps hostile peer content in a canonical user-data envelope',
    ['admit_untrusted', 'render_user_envelope', 'no_authority'],
  ],
  [
    '02',
    'missing-interception-denies',
    'tests/inference-control-model-runtime.test.mjs',
    'missing required tool interception denies before provider invocation',
    ['negotiate', 'deny_capability', 'zero_provider_calls'],
  ],
  [
    '03',
    'buffered-unsafe-zero-release',
    'tests/inference-control-model-runtime.test.mjs',
    'buffered model executor releases zero bytes when final assessment denies',
    ['pre_run_allow', 'buffer', 'post_run_deny', 'zero_release'],
  ],
  [
    '04',
    'incremental-prefix-only',
    'tests/inference-control-model-runtime.test.mjs',
    'incremental control releases only accepted prefixes and stops after denial',
    ['assess_prefix', 'release_prefix', 'deny_next', 'fence_late'],
  ],
  [
    '05',
    'assessment-binding-reuse-denied',
    'tests/inference-control-contracts.test.mjs',
    'strict restore rebinds every construction dependency kind exactly',
    ['bind_assessor', 'change_binding', 'restore_denied'],
  ],
  [
    '06',
    'continuation-budget',
    'tests/inference-control-reducer.test.mjs',
    'wrong and stale assessments have no protected effect and continuation budgets terminate',
    ['retry_once', 'retry_again', 'budget_exhausted', 'deny'],
  ],
  [
    '07',
    'stale-coordinated-grant',
    'tests/inference-control-gateways.test.mjs',
    'coordinated actions require atomic downstream fencing and revalidate after context resolution',
    ['reserve', 'authority_advance', 'deny', 'zero_dispatch'],
  ],
  [
    '08',
    'action-substitution',
    'tests/inference-control-gateways.test.mjs',
    'Action Gateway rejects argument substitution before dispatch',
    ['resolve_grant', 'digest_mismatch', 'zero_dispatch'],
  ],
  [
    '09',
    'concurrent-single-use',
    'tests/inference-control-gateways.test.mjs',
    'Action Gateway reserves once and concurrent use produces one dispatch',
    ['race_reservations', 'one_winner', 'one_dispatch'],
  ],
  [
    '10',
    'indeterminate-downstream',
    'tests/inference-control-gateways.test.mjs',
    'authority advance and ambiguous dispatch never create a second action attempt',
    ['reserve', 'dispatch_started', 'timeout', 'indeterminate', 'no_retry'],
  ],
  [
    '11',
    'cancellation-fences-late-events',
    'tests/inference-control-reducer.test.mjs',
    'pure reducer correlates assessments, fences rollback, and rejects sequence gaps',
    [
      'cancel',
      'late_chunk_denied',
      'late_assessment_denied',
      'late_grant_denied',
    ],
  ],
  [
    '12',
    'capacity-saturation',
    'tests/inference-control-reducer.test.mjs',
    'capacity saturation preserves admitted context, assessments, grants, and diagnostics',
    ['fill_capacity', 'reject_new', 'retain_existing'],
  ],
  [
    '13',
    'quiescent-snapshot-equivalence',
    'tests/inference-control-contracts.test.mjs',
    'quiescent snapshot replay is identical and reports the first controlled divergence',
    ['snapshot', 'restore', 'replay_equal', 'controlled_change_diverges'],
  ],
  [
    '14',
    'telemetry-failure-nonauthoritative',
    'tests/inference-control-contracts.test.mjs',
    'redacted evidence is non-restorable and telemetry failure is non-authoritative',
    ['decide', 'sink_fails', 'decision_unchanged'],
  ],
  [
    '15',
    'alpha2-compatibility',
    'tests/mesh-loopback.test.mjs',
    'signed loopback completes a causal ping round trip',
    ['run_baseline', 'complete_unchanged'],
  ],
  [
    '16',
    'renderer-role-separation',
    'tests/inference-control-model-runtime.test.mjs',
    'runtime renderer strips ambient authority fields and keeps peer data ordinary input',
    ['resolve_zones', 'strip_ambient_authority', 'render_data'],
  ],
  [
    '17',
    'assessor-correlation',
    'tests/inference-control-reducer.test.mjs',
    'wrong and stale assessments have no protected effect and continuation budgets terminate',
    [
      'wrong_assessor_denied',
      'stale_generation_denied',
      'zero_protected_effect',
    ],
  ],
  [
    '18',
    'mandatory-empty-arguments',
    'tests/inference-control-gateways.test.mjs',
    'no-argument actions bind canonical empty input and scoped idempotency conflicts',
    ['canonical_empty_object', 'digest_match', 'dispatch_once'],
  ],
  [
    '19',
    'grant-reservation-crash',
    'tests/inference-control-gateways.test.mjs',
    'reserved Action Grant restores as indeterminate and never issued',
    ['reserve', 'snapshot', 'restore_indeterminate', 'no_dispatch'],
  ],
  [
    '20',
    'scoped-idempotency',
    'tests/inference-control-gateways.test.mjs',
    'no-argument actions bind canonical empty input and scoped idempotency conflicts',
    ['exact_replay_retained', 'changed_action_conflicts'],
  ],
  [
    '21',
    'logical-time-rollback',
    'tests/inference-control-reducer.test.mjs',
    'pure reducer correlates assessments, fences rollback, and rejects sequence gaps',
    ['advance_high_water', 'rollback_denied', 'state_identity_preserved'],
  ],
  [
    '22',
    'authority-race',
    'tests/inference-control-gateways.test.mjs',
    'coordinated actions require atomic downstream fencing and revalidate after context resolution',
    [
      'first_authority_current',
      'reserve',
      'second_authority_stale',
      'zero_dispatch',
    ],
  ],
  [
    '23',
    'stream-normalization',
    'tests/inference-control-reducer.test.mjs',
    'pure reducer correlates assessments, fences rollback, and rejects sequence gaps',
    [
      'utf8_bytes_verified',
      'sequence_gap_denied',
      'completion_mismatch_denied',
    ],
  ],
  [
    '24',
    'outbound-message-interception',
    'tests/inference-control-gateways.test.mjs',
    'message denial and ambiguous send produce zero retry sends',
    ['assessment_deny_zero_send', 'ambiguous_send_indeterminate', 'no_retry'],
  ],
  [
    '25',
    'snapshot-confidentiality',
    'tests/inference-control-contracts.test.mjs',
    'redacted evidence is non-restorable and telemetry failure is non-authoritative',
    ['project_redacted', 'omit_content', 'restore_denied'],
  ],
  [
    '26',
    'inflight-restore-fencing',
    'tests/inference-control-gateways.test.mjs',
    'reserved message attempt restores as indeterminate without send',
    ['snapshot_reserved', 'restore_indeterminate', 'zero_external_attempt'],
  ],
  [
    '27',
    'dependency-rebinding',
    'tests/inference-control-contracts.test.mjs',
    'strict restore rebinds every construction dependency kind exactly',
    ['enumerate_seven_kinds', 'exact_rebind', 'missing_binding_denied'],
  ],
  [
    '28',
    'controlled-sse-terminality',
    'tests/inference-control-model-runtime.test.mjs',
    'controlled SSE validator rejects post-terminal events and EOF without terminal',
    ['start', 'ordered_events', 'one_terminal', 'post_terminal_denied'],
  ],
];

export const INFERENCE_CONTROL_SCENARIO_COUNT = 28;

export function buildInferenceControlScenarioReport() {
  return definitions.map(
    ([scenarioId, name, testFile, testTitle, orderedDecisions]) => {
      const configuration = {
        schemaVersion: 1,
        releaseVersion: INFERENCE_CONTROL_SCENARIO_RELEASE_VERSION,
        scenarioId,
        name,
        eventLimit: 128,
        internalStepLimit: 1_024,
        logicalTimeLimitMs: 10_000,
        fixture: testTitle,
      };
      const policy = {
        schemaVersion: 1,
        policyId: `policy:scenario:${scenarioId}`,
        policyVersion: 1,
        scenarioConfigurationDigest: digestControlJsonV1(
          'trace',
          configuration,
        ),
      };
      return Object.freeze({
        schemaVersion: 1,
        scenarioId,
        name,
        configuration: Object.freeze(configuration),
        seed: scenarioId === '09' ? 'alpha3-concurrency-seed-09' : null,
        policyDigest: digestControlJsonV1('policy', policy),
        capabilityDescriptor: descriptor,
        capabilityDescriptorDigest: digestControlJsonV1(
          'capability',
          descriptor,
        ),
        orderedDecisions: Object.freeze([...orderedDecisions]),
        firstReplayDivergence: scenarioId === '13' ? 0 : null,
        evidence: Object.freeze({ testFile, testTitle }),
      });
    },
  );
}

export async function verifyInferenceControlScenarioReport({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const report = buildInferenceControlScenarioReport();
  if (report.length !== INFERENCE_CONTROL_SCENARIO_COUNT)
    throw new Error('scenario_count_mismatch');
  if (
    new Set(report.map((scenario) => scenario.scenarioId)).size !==
    report.length
  )
    throw new Error('scenario_id_conflict');
  for (const scenario of report) {
    const source = await readFile(
      path.join(root, scenario.evidence.testFile),
      'utf8',
    );
    if (!source.includes(scenario.evidence.testTitle))
      throw new Error(`scenario_evidence_missing:${scenario.scenarioId}`);
    if (
      scenario.orderedDecisions.length < 1 ||
      !/^sha256:[0-9a-f]{64}$/.test(scenario.policyDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(scenario.capabilityDescriptorDigest)
    )
      throw new Error(`scenario_record_invalid:${scenario.scenarioId}`);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await verifyInferenceControlScenarioReport();
  process.stdout.write(
    process.argv.includes('--check')
      ? `verified ${report.length} inference-control scenarios\n`
      : `${JSON.stringify(report, null, 2)}\n`,
  );
}
