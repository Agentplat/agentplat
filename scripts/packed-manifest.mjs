import assert from 'node:assert/strict';
import semver from 'semver';

export const PACKED_RUNTIME_DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
]);

/**
 * Published manifests must contain registry-compatible ranges rather than
 * workspace-only protocol references.
 */
export function assertPackedInternalDependencyRanges(manifest) {
  assert.equal(
    typeof manifest?.name,
    'string',
    'Packed manifest must declare a package name'
  );
  assert.ok(
    semver.valid(manifest.version),
    `${manifest.name} must declare a valid packed semantic version`
  );
  for (const field of PACKED_RUNTIME_DEPENDENCY_FIELDS) {
    const dependencies = manifest[field] === undefined ? {} : manifest[field];
    assert.equal(
      dependencies !== null &&
        typeof dependencies === 'object' &&
        !Array.isArray(dependencies),
      true,
      `${manifest.name}.${field} must be an object when present`
    );
    for (const [dependency, range] of Object.entries(dependencies)) {
      if (!dependency.startsWith('@agentplat/')) continue;
      assert.equal(
        typeof range,
        'string',
        `${manifest.name}.${field}.${dependency} must use a string range`
      );
      assert.ok(
        semver.validRange(range),
        `${manifest.name}.${field}.${dependency} must use a registry-compatible semantic version range`
      );
      assert.equal(
        semver.satisfies(manifest.version, range, {
          includePrerelease: true,
        }),
        true,
        `${manifest.name}.${field}.${dependency} must include coordinated version ${manifest.version}`
      );
    }
  }
}
