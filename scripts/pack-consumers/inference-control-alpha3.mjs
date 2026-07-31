import {
  CapabilityRegistryV1,
  createContextEntryV1,
  digestControlJsonV1,
  INFERENCE_CONTROL_LIMITS_V1,
} from '@agentplat/inference-control';
import { ControlledModelExecutorV1 } from '@agentplat/inference-control/model';
import { createControlledAgentSseValidatorV1 } from '@agentplat/inference-control/runtime';
import {
  ActionGateway,
  LocalGrantLedger,
  actionDigest,
  actionInputDigest,
  canonicalControlJson,
  scopeDigest,
} from '@agentplat/inference-control/tools';
import {
  LocalMessageAttemptLedger,
  OutboundMessageGateway,
  outboundMessageDigest,
} from '@agentplat/inference-control/messages';

const context = createContextEntryV1({
  contextEntryId: 'context:policy',
  runId: 'run:alpha3',
  tenantId: 'tenant:alpha3',
  zone: 'policy',
  sourceKind: 'local',
  sourceId: 'policy:alpha3',
  sourceVersion: 1,
  mediaType: 'text',
  content: 'Follow the policy.',
  createdAtLogicalMs: 1,
  scope: null,
  derivation: null,
});
const descriptor = {
  schemaVersion: 1,
  capabilityId: 'control:alpha3',
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
  wrapperId: 'wrapper:alpha3',
  wrapperVersion: 1,
};
const capabilityRegistry = new CapabilityRegistryV1();
const capability = capabilityRegistry.register({
  descriptor,
  wrapperInstanceId: 'instance:alpha3',
});
const policy = {
  schemaVersion: 1,
  policyId: 'policy:alpha3',
  policyVersion: 1,
  parentPolicyDigest: null,
  mode: 'buffered',
  outputRisk: 'high',
  checkpoints: ['post_run', 'pre_run'],
  requiredCapabilities: [
    { kind: 'final_output_assessment', value: 'full' },
    { kind: 'input_inspection', value: 'full' },
  ],
  minimumCapabilityAssurance: 'verified',
  allowedCapabilityBindings: [
    {
      schemaVersion: 1,
      capabilityId: descriptor.capabilityId,
      descriptorVersion: descriptor.descriptorVersion,
      wrapperId: descriptor.wrapperId,
      wrapperVersion: descriptor.wrapperVersion,
      descriptorDigest: capability.descriptorDigest,
      requiredAssurance: descriptor.assurance,
    },
  ],
  allowedContextZones: ['policy'],
  allowedTransformerBindings: [],
  allowedActions: [],
  allowedMessageChannels: [],
  assessmentBindings: [
    {
      schemaVersion: 1,
      checkpoint: 'post_run',
      assessorId: 'assessor:alpha3',
      assessorVersion: 1,
      assessorBindingDigest: digestControlJsonV1('capability', {
        id: 'assessor:alpha3',
      }),
      maximumResponseBytes: 1024,
      maximumEvidenceReferences: 1,
      timeoutMs: 100,
    },
    {
      schemaVersion: 1,
      checkpoint: 'pre_run',
      assessorId: 'assessor:alpha3',
      assessorVersion: 1,
      assessorBindingDigest: digestControlJsonV1('capability', {
        id: 'assessor:alpha3',
      }),
      maximumResponseBytes: 1024,
      maximumEvidenceReferences: 1,
      timeoutMs: 100,
    },
  ],
  budgets: { revisions: 0, retries: 0, challenges: 0 },
  limits: INFERENCE_CONTROL_LIMITS_V1,
  maximumRunDurationMs: 1_000,
  maximumAssessmentTtlMs: 100,
  maximumGrantTtlMs: 100,
  maximumMessagePermitTtlMs: 100,
  exhaustedDisposition: 'deny',
  coordinatedActionsRequired: false,
  diagnosticsPolicyId: 'diagnostics:alpha3',
  redactionPolicyId: 'redaction:alpha3',
};
const executor = new ControlledModelExecutorV1({
  adapter: {
    id: 'packed',
    capabilities: {
      streaming: false,
      tools: false,
      structuredOutput: false,
      vision: false,
    },
    async generate() {
      return { content: 'safe', finishReason: 'stop' };
    },
  },
  controlBoundary: {
    capabilityRegistry,
    resolvePolicy: (policyId, policyVersion) =>
      policyId === policy.policyId && policyVersion === policy.policyVersion
        ? policy
        : undefined,
  },
  contextEntries: () => [context],
  mode: 'buffered',
  outputRisk: 'high',
  assessor: {
    assessorId: 'assessor:alpha3',
    assessorVersion: 1,
    assessorBindingDigest: digestControlJsonV1('capability', {
      id: 'assessor:alpha3',
    }),
    async assess() {
      return { disposition: 'allow', reasonCode: 'ok' };
    },
  },
});
const result = await executor.generate(
  {
    schemaVersion: 1,
    runId: 'run:alpha3',
    tenantId: 'tenant:alpha3',
    policyId: 'policy:alpha3',
    policyVersion: 1,
    capabilityHandleId: capability.capabilityHandleId,
    contextEntryIds: ['context:policy'],
    model: null,
    tools: [],
    options: null,
    scope: null,
  },
  { tenant: { tenantId: 'tenant:alpha3' } },
);
const incrementalPolicy = {
  ...policy,
  policyId: 'policy:alpha3:incremental',
  mode: 'incremental',
  outputRisk: 'low',
  checkpoints: ['post_run', 'pre_run', 'stream'],
  requiredCapabilities: [
    { kind: 'final_output_assessment', value: 'full' },
    { kind: 'incremental_output_assessment', value: 'windowed' },
    { kind: 'input_inspection', value: 'full' },
    { kind: 'release_interruption', value: 'local' },
  ],
  assessmentBindings: [
    ...policy.assessmentBindings,
    {
      schemaVersion: 1,
      checkpoint: 'stream',
      assessorId: 'assessor:alpha3',
      assessorVersion: 1,
      assessorBindingDigest: digestControlJsonV1('capability', {
        id: 'assessor:alpha3',
      }),
      maximumResponseBytes: 1024,
      maximumEvidenceReferences: 1,
      timeoutMs: 100,
    },
  ],
};
const incremental = new ControlledModelExecutorV1({
  adapter: {
    id: 'packed-incremental',
    capabilities: {
      streaming: true,
      tools: false,
      structuredOutput: false,
      vision: false,
    },
    async generate() {
      return { content: 'unused', finishReason: 'stop' };
    },
    async *stream() {
      yield { type: 'text_delta', content: 'accepted' };
      yield { type: 'text_delta', content: 'blocked' };
      yield {
        type: 'completed',
        result: { content: 'acceptedblocked', finishReason: 'stop' },
      };
    },
  },
  controlBoundary: {
    capabilityRegistry,
    resolvePolicy: (policyId, policyVersion) =>
      policyId === incrementalPolicy.policyId &&
      policyVersion === incrementalPolicy.policyVersion
        ? incrementalPolicy
        : undefined,
  },
  contextEntries: () => [context],
  mode: 'incremental',
  outputRisk: 'low',
  assessor: {
    assessorId: 'assessor:alpha3',
    assessorVersion: 1,
    assessorBindingDigest: digestControlJsonV1('capability', {
      id: 'assessor:alpha3',
    }),
    async assess(request) {
      return request.checkpoint === 'stream' && request.sequence === 1
        ? {
            disposition: 'deny',
            reasonCode: 'assessment_content_mismatch',
          }
        : { disposition: 'allow', reasonCode: 'assessment_required' };
    },
  },
});
const incrementalEvents = [];
for await (const event of incremental.stream(
  {
    schemaVersion: 1,
    runId: 'run:alpha3',
    tenantId: 'tenant:alpha3',
    policyId: incrementalPolicy.policyId,
    policyVersion: 1,
    capabilityHandleId: capability.capabilityHandleId,
    contextEntryIds: ['context:policy'],
    model: null,
    tools: [],
    options: null,
    scope: null,
  },
  { tenant: { tenantId: 'tenant:alpha3' } },
))
  incrementalEvents.push(event);
const validator = createControlledAgentSseValidatorV1();
validator.validate({
  version: 1,
  sequence: 1,
  type: 'control_started',
  runId: 'run:alpha3',
  payload: {
    schemaVersion: 1,
    generation: 1,
    policyId: 'policy:alpha3',
    policyVersion: 1,
  },
});
validator.validate({
  version: 1,
  sequence: 2,
  type: 'control_completed',
  runId: 'run:alpha3',
  payload: {
    schemaVersion: 1,
    generation: 1,
    status: 'completed',
    releasedBytes: 0,
    outputDigest: digestControlJsonV1('assessment-target', ''),
  },
});
validator.finish();
const scope = {
  schemaVersion: 1,
  kind: 'standalone',
  tenantId: 'tenant:alpha3',
  runId: 'run:alpha3',
  agentId: 'agent:alpha3',
  organizationId: null,
  workspaceId: null,
  policyId: 'policy:alpha3',
  policyVersion: 1,
};
const messageDigest = outboundMessageDigest({
  schemaVersion: 1,
  messageId: 'message:alpha3',
  runId: 'run:alpha3',
  tenantId: 'tenant:alpha3',
  channel: 'email',
  recipient: 'user@example.test',
  mediaType: 'text',
  content: 'safe',
  scope,
  idempotencyKey: 'message:one',
});
const binding = {
  schemaVersion: 1,
  actionBindingId: 'binding:alpha3',
  actionBindingVersion: 1,
  namespace: 'packed',
  toolId: 'tool:packed',
  operation: 'invoke',
  dispatcherId: 'dispatcher:packed',
  dispatcherVersion: 1,
  contextResolverId: 'context-resolver:packed',
  contextResolverVersion: 1,
  fencingMode: 'local_only',
  handlerDigest: `sha256:${'1'.repeat(64)}`,
};
const provisionalGrant = {
  schemaVersion: 1,
  grantId: 'grant:alpha3',
  stateGeneration: 1,
  scope,
  scopeDigest: scopeDigest(scope),
  namespace: binding.namespace,
  toolId: binding.toolId,
  operation: binding.operation,
  actionBindingId: binding.actionBindingId,
  actionBindingVersion: binding.actionBindingVersion,
  handlerDigest: binding.handlerDigest,
  inputDigest: actionInputDigest({}),
  actionDigest: '',
  assessmentRequestId: 'assessment-request:action',
  assessmentId: 'assessment:action',
  assessmentTargetDigest: `sha256:${'2'.repeat(64)}`,
  idempotencyKey: 'action:one',
  issuedAtLogicalMs: 1,
  expiresAtLogicalMs: 100,
  singleUse: true,
  status: 'issued',
  reservation: null,
};
const grant = {
  ...provisionalGrant,
  actionDigest: actionDigest(provisionalGrant, binding),
};
const grantLedger = new LocalGrantLedger('gateway:packed');
grantLedger.issue(grant);
let actionDispatches = 0;
const actionGateway = new ActionGateway(
  grantLedger,
  binding,
  {
    dispatcherId: binding.dispatcherId,
    dispatcherVersion: binding.dispatcherVersion,
    fencingMode: 'local_only',
    async dispatch() {
      actionDispatches += 1;
      return { ok: true, value: { packed: true } };
    },
  },
  {
    contextResolverId: binding.contextResolverId,
    contextResolverVersion: binding.contextResolverVersion,
    async resolve() {
      return {
        tenant: { tenantId: scope.tenantId },
        toolId: binding.toolId,
        runId: scope.runId,
      };
    },
  },
  {
    resolverId: 'authority:packed',
    resolverVersion: 1,
    async resolve(currentScope, actionDigestValue) {
      return {
        schemaVersion: 1,
        status: 'current',
        resolverId: 'authority:packed',
        resolverVersion: 1,
        scopeDigest: scopeDigest(currentScope),
        actionDigest: actionDigestValue,
        scope: currentScope,
        authorityGeneration: null,
        fencingToken: null,
      };
    },
  },
  {
    assessorId: 'assessor:packed',
    assessorVersion: 1,
    async consumeCurrent() {
      return true;
    },
  },
);
await actionGateway.invoke({
  schemaVersion: 1,
  grantId: grant.grantId,
  logicalTimeMs: 2,
});

const message = {
  schemaVersion: 1,
  messageId: 'message:alpha3',
  runId: scope.runId,
  tenantId: scope.tenantId,
  channel: 'email',
  recipient: 'user@example.test',
  mediaType: 'text',
  content: 'safe',
  scope,
  idempotencyKey: 'message:one',
  messageDigest,
};
const attempt = {
  schemaVersion: 1,
  messageAttemptId: 'message-attempt:alpha3',
  messageId: message.messageId,
  assessmentRequestId: 'assessment-request:message',
  assessmentId: 'assessment:message',
  messageDigest,
  scopeDigest: scopeDigest(scope),
  idempotencyKey: message.idempotencyKey,
  generation: 1,
  dispatcherId: 'message-dispatcher:packed',
  dispatcherVersion: 1,
  dispatcherDigest: `sha256:${'3'.repeat(64)}`,
  status: 'prepared',
  reservation: null,
  reservedAtLogicalMs: null,
  expiresAtLogicalMs: 100,
};
const messageLedger = new LocalMessageAttemptLedger('gateway:message:packed');
messageLedger.prepare(attempt);
let messageSends = 0;
const messageGateway = new OutboundMessageGateway(
  messageLedger,
  {
    dispatcherId: attempt.dispatcherId,
    dispatcherVersion: attempt.dispatcherVersion,
    dispatcherDigest: attempt.dispatcherDigest,
    fencingMode: 'local_only',
    async send() {
      messageSends += 1;
      return { ok: true };
    },
  },
  {
    resolverId: 'authority:packed',
    resolverVersion: 1,
    async resolve(currentScope, actionDigestValue) {
      return {
        schemaVersion: 1,
        status: 'current',
        resolverId: 'authority:packed',
        resolverVersion: 1,
        scopeDigest: scopeDigest(currentScope),
        actionDigest: actionDigestValue,
        scope: currentScope,
        authorityGeneration: null,
        fencingToken: null,
      };
    },
  },
  {
    assessorId: 'assessor:packed',
    assessorVersion: 1,
    async consumeCurrent() {
      return true;
    },
  },
  ['email'],
);
await messageGateway.send({
  schemaVersion: 1,
  message,
  logicalTimeMs: 2,
});
if (
  result.status !== 'completed' ||
  result.output !== 'safe' ||
  !canonicalControlJson(scope).includes('standalone') ||
  !messageDigest.startsWith('sha256:') ||
  actionDispatches !== 1 ||
  messageSends !== 1 ||
  incrementalEvents
    .filter((event) => event.type === 'control_output_released')
    .map((event) => event.content)
    .join('') !== 'accepted'
)
  process.exit(1);
console.log(
  'Verified packed inference-control public entrypoints and controlled behavior.',
);
