import assert from 'node:assert/strict';

import {
  MemoryCollectiveAuthorityRepositoryV1,
  MemoryCollectiveEvidenceSinkV1,
  MemoryCollectiveExecutionRepositoryV1,
} from '@agentplat/collective-control/memory';
import {
  createControlConformanceFixturesV1,
  runControlConformanceV1,
} from '@agentplat/mesh-conformance/control';
import { LocalGrantLedger } from '@agentplat/inference-control/tools';

const declaredCapabilities = [
  'control.portable',
  'control.repositories',
  'control.rooms',
];
const cases = await runControlConformanceV1({
  declaredCapabilities,
  seed: 24_604,
  factory() {
    const fixtures = createControlConformanceFixturesV1();
    const evidenceSink = new MemoryCollectiveEvidenceSinkV1(
      fixtures.authorityState.tenantId,
      fixtures.authorityState.policyDomainId
    );
    return {
      authorityRepository: new MemoryCollectiveAuthorityRepositoryV1(
        fixtures.authorityState
      ),
      executionRepository: new MemoryCollectiveExecutionRepositoryV1(
        fixtures.executionState
      ),
      actionGrantRepository: new LocalGrantLedger('gateway:registry-consumer'),
      evidenceSink,
      inspectEvidence: () => evidenceSink.snapshot(),
      fixtures,
    };
  },
});
const declared = cases.filter((entry) =>
  declaredCapabilities.includes(entry.capability)
);
assert.equal(declared.length, 13);
assert.equal(
  declared.every((entry) => entry.outcome === 'passed'),
  true
);
assert.equal(
  cases.filter((entry) => entry.outcome === 'not_declared').length,
  1
);
process.stdout.write(
  `${JSON.stringify({ status: 'passed', declaredCases: declared.length })}\n`
);
