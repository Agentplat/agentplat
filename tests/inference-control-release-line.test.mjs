import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertInferenceControlReleaseLine,
  INFERENCE_CONTROL_PACKAGE_COUNT,
  INFERENCE_CONTROL_PACKAGE_NAME,
  INFERENCE_CONTROL_RELEASE_VERSION,
} from '../scripts/inference-control-release-line.mjs';

test('inference-control release line accepts exactly 29 Alpha 3 manifests', async (t) => {
  const root = await createReleaseLineFixture();
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertInferenceControlReleaseLine({ root }), true);
});

test('inference-control release line rejects the transient Alpha 2 workspace', async (t) => {
  const root = await createReleaseLineFixture({ version: '0.3.0-alpha.2' });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertInferenceControlReleaseLine({ root }),
    /requires root version 0\.3\.0-alpha\.3/,
  );
});

test('inference-control release line rejects a non-coordinated manifest version', async (t) => {
  const root = await createReleaseLineFixture({
    packageVersion: '0.3.0-alpha.2',
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertInferenceControlReleaseLine({ root }),
    /must use 0\.3\.0-alpha\.3/,
  );
});

test('inference-control release line rejects a catalog that is not exactly 29 packages', async (t) => {
  const root = await createReleaseLineFixture({ packageCount: 28 });
  t.after(() => rm(root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertInferenceControlReleaseLine({ root }),
    /requires exactly 29 cataloged packages/,
  );
});

test('release-line guard remains inert before inference-control is cataloged', async (t) => {
  const root = await createReleaseLineFixture({
    includeInferenceControl: false,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  assert.equal(await assertInferenceControlReleaseLine({ root }), false);
});

async function createReleaseLineFixture({
  includeInferenceControl = true,
  packageCount = INFERENCE_CONTROL_PACKAGE_COUNT,
  packageVersion = INFERENCE_CONTROL_RELEASE_VERSION,
  version = INFERENCE_CONTROL_RELEASE_VERSION,
} = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-inference-line-'),
  );
  const names = Array.from({ length: packageCount }, (_, index) =>
    index === 0 && includeInferenceControl
      ? 'inference-control'
      : `package-${index}`,
  ).sort();
  const catalog = {
    schemaVersion: 2,
    packages: names.map((name) => ({
      browserEntrypoints: [],
      directory: `packages/${name}`,
      layer: 'runtime',
      name: `@agentplat/${name}`,
      packSmoke: true,
      providerNeutral: true,
      publish: true,
    })),
  };
  await mkdir(path.join(root, 'config'), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, 'config/public-packages.json'),
      `${JSON.stringify(catalog, null, 2)}\n`,
    ),
    ...catalog.packages.map(async (entry, index) => {
      const manifestPath = path.join(root, entry.directory, 'package.json');
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(
        manifestPath,
        `${JSON.stringify(
          {
            name: entry.name,
            version: index === 0 ? packageVersion : version,
          },
          null,
          2,
        )}\n`,
      );
    }),
  ]);
  return root;
}
