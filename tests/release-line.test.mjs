import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertReleaseLine,
  RELEASE_LINES,
  TRUST_PACKAGE_NAME,
} from '../scripts/release-line.mjs';

const [ALPHA_3, ALPHA_4, ALPHA_5, BETA_1, BETA_2, BETA_3] = RELEASE_LINES;

test('release-line guard accepts the historical 29-package Alpha 3 cohort before Trust is cataloged', async (t) => {
  const root = await createReleaseLineFixture({ line: ALPHA_3 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard accepts the coordinated 30-package Alpha 4 cohort with Trust exactly once', async (t) => {
  const root = await createReleaseLineFixture({ line: ALPHA_4 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard accepts the coordinated 33-package Alpha 5 cohort', async (t) => {
  const root = await createReleaseLineFixture({ line: ALPHA_5 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard accepts the coordinated 34-package Beta 1 cohort', async (t) => {
  const root = await createReleaseLineFixture({ line: BETA_1 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard accepts the coordinated 36-package Beta 2 cohort', async (t) => {
  const root = await createReleaseLineFixture({ line: BETA_2 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard accepts the coordinated 39-package Beta 3 cohort', async (t) => {
  const root = await createReleaseLineFixture({ line: BETA_3 });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertReleaseLine({ root }), true);
});

test('release-line guard rejects Beta 2 versions in a 39-package cohort', async (t) => {
  const root = await createReleaseLineFixture({
    line: BETA_3,
    version: BETA_2.releaseVersion,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /release line beta3 requires root version 0\.3\.0-beta\.3/i
  );
});

test('release-line guard rejects a 39-package Beta 2 cohort', async (t) => {
  const root = await createReleaseLineFixture({
    line: BETA_2,
    packageCount: 39,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /release line beta3 requires root version 0\.3\.0-beta\.3/i
  );
});

test('release-line guard rejects Alpha 4 versions in a 29-package cohort', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_3,
    version: ALPHA_4.releaseVersion,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /release line alpha3 requires root version 0\.3\.0-alpha\.3/i
  );
});

test('release-line guard rejects a 31-package Alpha 4 cohort', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    packageCount: 31,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /requires exactly 29 Alpha 3 packages/i
  );
});

test('release-line guard rejects a 30-package Alpha 3 cohort', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_3,
    packageCount: 30,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /requires exactly 29 Alpha 3 packages/i
  );
});

test('release-line guard rejects a mixed manifest version before release operations', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    packageVersion: ALPHA_3.releaseVersion,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /must use 0\.3\.0-alpha\.4 on release line alpha4/i
  );
});

test('release-line guard rejects a root-version mismatch', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    version: ALPHA_3.releaseVersion,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /release line alpha4 requires root version 0\.3\.0-alpha\.4/i
  );
});

test('release-line guard rejects a catalog/workspace mismatch', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    manifestDirectoryOffset: 1,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /workspace manifests to match the catalog in ASCII order/i
  );
});

test('release-line guard rejects Alpha 3 when Trust appears in the catalog', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_3,
    includeTrust: true,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /requires exactly 29 Alpha 3 packages/i
  );
});

test('release-line guard rejects Alpha 4 when Trust is absent', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    includeTrust: false,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertReleaseLine({ root }),
    /requires exactly 29 Alpha 3 packages/i
  );
});

test('release-line guard rejects duplicate Trust catalog entries', async (t) => {
  const root = await createReleaseLineFixture({
    line: ALPHA_4,
    duplicateTrust: true,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(() => assertReleaseLine({ root }));
});

async function createReleaseLineFixture({
  duplicateTrust = false,
  line,
  includeTrust = line.trustPackageCount === 1,
  manifestDirectoryOffset = 0,
  packageCount = line.catalogPackageCount,
  packageVersion = line.releaseVersion,
  version = line.releaseVersion,
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentplat-release-line-'));
  const names = Array.from(
    { length: packageCount },
    (_, index) => `package-${index}`
  );
  if (includeTrust) names[0] = TRUST_PACKAGE_NAME.slice('@agentplat/'.length);
  if (duplicateTrust) names[1] = TRUST_PACKAGE_NAME.slice('@agentplat/'.length);
  const sortedNames = names.sort();
  const catalog = {
    schemaVersion: 2,
    packages: sortedNames.map((name) => ({
      browserEntrypoints: [],
      directory: `packages/${name}`,
      layer: 'runtime',
      name: `@agentplat/${name}`,
      packSmoke: true,
      providerNeutral: true,
      publish: true,
    })),
  };
  const manifestEntries = catalog.packages.map((entry, index) => ({
    ...entry,
    directory:
      index === 0 && manifestDirectoryOffset !== 0
        ? `packages/package-${packageCount + manifestDirectoryOffset}`
        : entry.directory,
  }));

  await mkdir(path.join(root, 'config'), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`
    ),
    writeFile(
      path.join(root, 'config/public-packages.json'),
      `${JSON.stringify(catalog, null, 2)}\n`
    ),
    ...manifestEntries.map(async (entry) => {
      const manifestPath = path.join(root, entry.directory, 'package.json');
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(
        manifestPath,
        `${JSON.stringify(
          { name: entry.name, version: packageVersion },
          null,
          2
        )}\n`
      );
    }),
  ]);
  return root;
}
