import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeProductionDependencyAuditV1 } from '../scripts/production-dependency-audit.mjs';

const emptyAllowlist = { schemaVersion: 1, acceptedAdvisories: [] };

test('production dependency audit passes empty and low-only reports', () => {
  const report = analyzeProductionDependencyAuditV1(
    {
      advisories: {
        '100': { id: 100, severity: 'low' },
      },
    },
    emptyAllowlist,
    '2026-08-03',
  );
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.severityCounts, {
    info: 0,
    low: 1,
    moderate: 0,
    high: 0,
    critical: 0,
  });
  assert.deepEqual(report.unacceptedHighCriticalAdvisoryIds, []);
  assert.match(report.reportDigest, /^sha256:[a-f0-9]{64}$/u);
});

test('production dependency audit fails every unaccepted high or critical advisory', () => {
  const report = analyzeProductionDependencyAuditV1(
    {
      vulnerabilities: {
        packageA: {
          via: [
            { source: 123, severity: 'high' },
            { source: 456, severity: 'critical' },
          ],
        },
      },
    },
    emptyAllowlist,
    '2026-08-03',
  );
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.unacceptedHighCriticalAdvisoryIds, ['123', '456']);
});

test('dependency exceptions require a reviewed reason, expiry and ordered identity', () => {
  const report = {
    advisories: { GHSA_TEST: { id: 'GHSA_TEST', severity: 'high' } },
  };
  const accepted = analyzeProductionDependencyAuditV1(
    report,
    {
      schemaVersion: 1,
      acceptedAdvisories: [
        {
          advisoryId: 'GHSA_TEST',
          reason: 'Reviewed and isolated from the production dependency path.',
          expiresOn: '2026-08-10',
        },
      ],
    },
    '2026-08-03',
  );
  assert.equal(accepted.status, 'passed');
  assert.deepEqual(accepted.acceptedHighCriticalAdvisoryIds, ['GHSA_TEST']);
  assert.throws(
    () =>
      analyzeProductionDependencyAuditV1(
        report,
        {
          schemaVersion: 1,
          acceptedAdvisories: [
            { advisoryId: 'GHSA_TEST', reason: 'too short', expiresOn: '2026-08-02' },
          ],
        },
        '2026-08-03',
      ),
    /dependency_audit_allowlist_invalid/u,
  );
});
