import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function verifyPlatformBoundaries({
  root = defaultRoot,
  configPath = "config/platform-boundaries.json",
} = {}) {
  const config = validateConfig(
    JSON.parse(await readFile(path.join(root, configPath), "utf8")),
  );
  const findings = [];
  let scannedSourceFiles = 0;
  for (const rule of config.sourceRules) {
    const files = await expandPaths(root, rule.paths, rule.exclude);
    for (const file of files) {
      scannedSourceFiles += 1;
      const source = await readFile(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          const relativeTarget = relative(root, resolved);
          if (
            relativeTarget === "apps" ||
            relativeTarget.startsWith("apps/") ||
            relativeTarget === "examples" ||
            relativeTarget.startsWith("examples/")
          )
            findings.push(
              `${relative(root, file)}: rule ${rule.id} imports application path ${specifier}`,
            );
        }
        for (const forbidden of rule.forbiddenImports)
          if (matchesSpecifier(specifier, forbidden))
            findings.push(
              `${relative(root, file)}: rule ${rule.id} forbids import ${specifier}`,
            );
      }
    }
  }

  for (const rule of config.portableManifests) {
    const directory = `packages/${rule.package.slice("@agentplat/".length)}`;
    const manifest = JSON.parse(
      await readFile(path.join(root, directory, "package.json"), "utf8"),
    );
    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    };
    for (const dependency of Object.keys(dependencies))
      for (const forbidden of rule.forbiddenDependencies)
        if (matchesSpecifier(dependency, forbidden))
          findings.push(
            `${directory}/package.json: ${rule.package} forbids dependency ${dependency}`,
          );
  }

  const terminologyFiles = await expandPaths(
    root,
    config.terminology.paths,
    [],
  );
  for (const file of terminologyFiles) {
    const source = await readFile(file, "utf8");
    for (const term of config.terminology.terms) {
      const expression = new RegExp(
        `(^|[^A-Za-z0-9_])${escapeRegex(term)}([^A-Za-z0-9_]|$)`,
        "iu",
      );
      if (expression.test(source))
        findings.push(
          `${relative(root, file)}: portable source contains restricted terminology ${term}`,
        );
    }
  }

  const catalog = await loadPublicPackageCatalog(root);
  const byName = new Map(catalog.packages.map((entry) => [entry.name, entry]));
  for (const admission of config.adapterAdmissions) {
    const entry = byName.get(admission.package);
    if (!entry || entry.layer !== "adapter") {
      findings.push(
        `${admission.package}: admitted adapter is not cataloged as adapter`,
      );
      continue;
    }
    if (
      admission.domainSemantics !== false ||
      admission.agentplatAuthoritative !== true
    )
      findings.push(
        `${admission.package}: adapter admission weakens the platform boundary`,
      );
    const manifest = JSON.parse(
      await readFile(path.join(root, entry.directory, "package.json"), "utf8"),
    );
    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    };
    if (!Object.hasOwn(dependencies, admission.portPackage))
      findings.push(
        `${entry.directory}/package.json: adapter does not depend on declared port ${admission.portPackage}`,
      );
  }

  assert.deepEqual(
    findings,
    [],
    `Platform boundary verification failed:\n${findings.join("\n")}`,
  );
  return Object.freeze({
    sourceRuleCount: config.sourceRules.length,
    adapterAdmissionCount: config.adapterAdmissions.length,
    terminologyTermCount: config.terminology.terms.length,
    scannedSourceFiles,
  });
}

function validateConfig(config) {
  assert.equal(config?.schemaVersion, 1);
  assert.ok(Array.isArray(config.sourceRules));
  assert.ok(Array.isArray(config.portableManifests));
  assert.ok(Array.isArray(config.adapterAdmissions));
  assert.ok(Array.isArray(config.terminology?.paths));
  assert.ok(Array.isArray(config.terminology?.terms));
  const ids = new Set();
  for (const rule of config.sourceRules) {
    assert.deepEqual(Object.keys(rule).sort(), [
      "exclude",
      "forbiddenImports",
      "id",
      "paths",
    ]);
    assert.match(rule.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(ids.has(rule.id), false);
    ids.add(rule.id);
    for (const field of ["paths", "exclude", "forbiddenImports"])
      assert.ok(
        Array.isArray(rule[field]) &&
          rule[field].every((value) => typeof value === "string" && value),
      );
  }
  for (const admission of config.adapterAdmissions) {
    assert.deepEqual(Object.keys(admission).sort(), [
      "agentplatAuthoritative",
      "domainSemantics",
      "package",
      "portPackage",
      "providerSpecific",
    ]);
    assert.match(admission.package, /^@agentplat\/[a-z0-9-]+$/u);
    assert.match(admission.portPackage, /^@agentplat\/[a-z0-9-]+$/u);
    for (const field of [
      "agentplatAuthoritative",
      "domainSemantics",
      "providerSpecific",
    ])
      assert.equal(typeof admission[field], "boolean");
  }
  const terms = config.terminology.terms;
  assert.equal(new Set(terms).size, terms.length);
  assert.deepEqual([...terms].sort(), terms);
  return config;
}

async function expandPaths(root, entries, exclude) {
  const excluded = new Set(exclude);
  const result = [];
  for (const entry of entries) {
    const target = path.join(root, entry);
    const metadata = await stat(target);
    if (metadata.isFile()) {
      if (sourceExtension(target) && !excluded.has(relative(root, target)))
        result.push(target);
      continue;
    }
    const pending = [target];
    while (pending.length) {
      const directory = pending.pop();
      const children = await readdir(directory, { withFileTypes: true });
      for (const child of children) {
        const candidate = path.join(directory, child.name);
        const name = relative(root, candidate);
        if (excluded.has(name)) continue;
        if (child.isDirectory()) pending.push(candidate);
        else if (child.isFile() && sourceExtension(candidate))
          result.push(candidate);
      }
    }
  }
  return [...new Set(result)].sort();
}

function importSpecifiers(source) {
  const result = new Set();
  const expressions = [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bimport\s+["']([^"']+)["']/gu,
  ];
  for (const expression of expressions)
    for (const match of source.matchAll(expression)) result.add(match[1]);
  return [...result].sort();
}

function matchesSpecifier(specifier, forbidden) {
  return (
    specifier === forbidden ||
    (forbidden.endsWith("/") && specifier.startsWith(forbidden))
  );
}

function sourceExtension(file) {
  return [".ts", ".mts", ".mjs", ".js"].includes(path.extname(file));
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await verifyPlatformBoundaries();
  console.log(
    `Platform boundaries passed (${report.sourceRuleCount} rules, ${report.adapterAdmissionCount} adapters, ${report.scannedSourceFiles} source files).`,
  );
}
