import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import semver from "semver";
import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";

/** Public metadata is evidence of distribution only, not working execution. */
export function analyzeDistribution({ version, tag, packages, metadata }) {
  assert.ok(semver.valid(version), "Expected an exact release version");
  const rows = packages.map(({ name, exports: sourceExports = [] }) => {
    const result = metadata[name];
    if (result?.status === 404)
      return { name, status: "unregistered", tags: {} };
    if (result?.status !== 200)
      return {
        name,
        status: "unverified",
        error: result?.error ?? `HTTP ${result?.status ?? "unknown"}`,
      };
    const document = result.document;
    const release = document.versions?.[version];
    const tags = document["dist-tags"] ?? {};
    const advertised = document.versions?.[tags[tag]];
    const missingAdvertisedExports = sourceExports.filter(
      (entry) => !Object.hasOwn(advertised?.exports ?? {}, entry),
    );
    const dependencyFindings = [];
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const [dependency, range] of Object.entries(
        release?.[field] ?? {},
      )) {
        if (!dependency.startsWith("@agentplat/")) continue;
        const dependencyMetadata = metadata[dependency];
        if (dependencyMetadata?.status !== 200) {
          dependencyFindings.push({
            dependency,
            range,
            field,
            issue:
              dependencyMetadata?.status === 404
                ? "unregistered"
                : "unverified",
          });
        } else if (
          !Object.keys(dependencyMetadata.document.versions ?? {}).some((v) =>
            semver.satisfies(v, range),
          )
        ) {
          dependencyFindings.push({
            dependency,
            range,
            field,
            issue: "no_matching_version",
          });
        }
      }
    }
    return {
      name,
      status: !release
        ? "version_missing"
        : tags[tag] !== version
          ? "tag_mismatch"
          : dependencyFindings.length
            ? "dependency_failure"
            : missingAdvertisedExports.length
              ? "export_failure"
              : "available",
      tags,
      versionPublished: !!release,
      missingAdvertisedExports,
      dependencyFindings,
    };
  });
  return {
    schemaVersion: 1,
    kind: "agentplat-npm-distribution-readiness-v1",
    version,
    tag,
    status: rows.every((row) => row.status === "available")
      ? "complete"
      : "incomplete",
    totals: {
      expected: rows.length,
      registered: rows.filter(
        (row) => row.tags && row.status !== "unregistered",
      ).length,
      versionPublished: rows.filter((row) => row.versionPublished).length,
      tagAligned: rows.filter((row) => row.tags?.[tag] === version).length,
      unregistered: rows.filter((row) => row.status === "unregistered").length,
      unverified: rows.filter((row) => row.status === "unverified").length,
    },
    rows,
  };
}

export async function readDistribution({
  root = process.cwd(),
  version,
  tag = "next",
  fetchImplementation = fetch,
} = {}) {
  const catalog = await loadPublicPackageCatalog(root);
  const rootManifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  version ??= rootManifest.version;
  assert.ok(semver.valid(version), "Expected an exact release version");
  assert.match(tag, /^[a-z][a-z0-9._-]*$/i);
  const packages = await Promise.all(
    catalog.packages
      .filter((p) => p.publish)
      .map(async (p) => {
        const manifest = JSON.parse(
          await readFile(path.join(root, p.directory, "package.json"), "utf8"),
        );
        return { name: p.name, exports: Object.keys(manifest.exports ?? {}) };
      }),
  );
  const metadata = {};
  async function read(name) {
    try {
      const response = await fetchImplementation(
        `https://registry.npmjs.org/${encodeURIComponent(name)}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        },
      );
      metadata[name] = {
        status: response.status,
        ...(response.status === 200 ? { document: await response.json() } : {}),
      };
    } catch (error) {
      metadata[name] = { status: 0, error: error.message };
    }
  }
  async function batch(names) {
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, names.length) }, async () => {
        while (index < names.length) await read(names[index++]);
      }),
    );
  }
  await batch(packages.map((p) => p.name));
  const additional = new Set();
  for (const result of Object.values(metadata)) {
    const release = result.document?.versions?.[version];
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const name of Object.keys(release?.[field] ?? {})) {
        if (name.startsWith("@agentplat/") && !metadata[name])
          additional.add(name);
      }
    }
  }
  await batch([...additional]);
  return {
    checkedAt: new Date().toISOString(),
    registry: "https://registry.npmjs.org/",
    ...analyzeDistribution({ version, tag, packages, metadata }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const options = {};
  let output,
    requireComplete = false;
  for (let i = 2; i < process.argv.length; i++) {
    const argument = process.argv[i];
    if (argument === "--require-complete") requireComplete = true;
    else if (
      argument === "--version" ||
      argument === "--tag" ||
      argument === "--output"
    ) {
      const value = process.argv[++i];
      assert.ok(
        value && !value.startsWith("--"),
        `Missing value for ${argument}`,
      );
      if (argument === "--output") output = value;
      else options[argument.slice(2)] = value;
    } else throw new Error(`Unknown argument ${argument}`);
  }
  const report = await readDistribution(options);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (output) await writeFile(output, json);
  else process.stdout.write(json);
  if (output)
    console.log(
      JSON.stringify({ status: report.status, ...report.totals, output }),
    );
  if (requireComplete && report.status !== "complete") process.exitCode = 1;
}
