import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export function inspectPackedTypeSurface(packageRoot, manifest, subpath) {
  const target = declarationTarget(manifest, subpath);
  assert.equal(
    typeof target,
    "string",
    `${manifest.name}${subpath === "." ? "" : `/${subpath.slice(2)}`} must declare a types target`,
  );
  const entrypoint = path.resolve(packageRoot, target);
  assert.ok(
    entrypoint.startsWith(`${path.resolve(packageRoot)}${path.sep}`),
    "Packed declaration target escapes the package",
  );
  const source = readFileSync(entrypoint);
  const names = [...collectDeclarationExports(entrypoint)].sort(compareAscii);
  return Object.freeze({
    declarationEntrypoint: path.relative(packageRoot, entrypoint),
    declarationSha256: createHash("sha256").update(source).digest("hex"),
    typeExports: Object.freeze(names),
  });
}

export function inspectSourceTypeSurface(packageRoot, manifest, subpath) {
  const target = declarationTarget(manifest, subpath);
  assert.equal(
    typeof target,
    "string",
    `${manifest.name}${subpath === "." ? "" : `/${subpath.slice(2)}`} must declare a types target`,
  );
  const sourceTarget = target
    .replace(/^\.\/dist\//u, "./src/")
    .replace(/\.d\.ts$/u, ".ts");
  const entrypoint = path.resolve(packageRoot, sourceTarget);
  assert.ok(
    entrypoint.startsWith(`${path.resolve(packageRoot)}${path.sep}`),
    "Source declaration target escapes the package",
  );
  const source = readFileSync(entrypoint);
  return Object.freeze({
    sourceEntrypoint: path.relative(packageRoot, entrypoint),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    typeExports: Object.freeze(
      [...collectDeclarationExports(entrypoint)].sort(compareAscii),
    ),
  });
}

export function assertPublicApiCompatibility(baselineRecords, currentRecords) {
  assert.ok(
    Array.isArray(baselineRecords),
    "Baseline API records are required",
  );
  assert.ok(Array.isArray(currentRecords), "Current API records are required");
  const current = new Map(
    currentRecords.map((record) => [surfaceKey(record), record]),
  );
  assert.equal(
    current.size,
    currentRecords.length,
    "Current API surface contains duplicate records",
  );
  for (const baseline of baselineRecords) {
    const key = surfaceKey(baseline);
    const candidate = current.get(key);
    assert.ok(candidate, `Current API surface removed ${key}`);
    const candidateTypes = new Set(candidate.typeExports);
    for (const name of baseline.typeExports) {
      assert.ok(
        candidateTypes.has(name),
        `Current API surface removed ${key} export ${name}`,
      );
    }
    if (baseline.browser === true) {
      assert.equal(
        candidate.browser,
        true,
        `Current API surface removed browser support from ${key}`,
      );
    }
    if (baseline.sideEffects === false) {
      assert.equal(
        candidate.sideEffects,
        false,
        `Current API surface introduced import side effects in ${key}`,
      );
    }
  }
}

function declarationTarget(manifest, subpath) {
  if (subpath === "." && manifest.types) return manifest.types;
  const entry = manifest.exports?.[subpath];
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  return entry.types;
}

function collectDeclarationExports(entrypoint, visited = new Set()) {
  const resolved = resolveDeclaration(entrypoint);
  if (visited.has(resolved)) return new Set();
  visited.add(resolved);
  const source = readFileSync(resolved, "utf8");
  const file = ts.createSourceFile(
    resolved,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set();
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      const moduleName = statement.moduleSpecifier?.text;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      } else if (
        statement.exportClause &&
        ts.isNamespaceExport(statement.exportClause)
      ) {
        names.add(statement.exportClause.name.text);
      } else if (typeof moduleName === "string" && moduleName.startsWith(".")) {
        for (const name of collectDeclarationExports(
          path.resolve(path.dirname(resolved), moduleName),
          visited,
        )) {
          names.add(name);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      names.add("default");
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      names.add("default");
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function resolveDeclaration(input) {
  const jsDeclarationCandidates = input.endsWith(".js")
    ? [input.replace(/\.js$/u, ".d.ts"), input.replace(/\.js$/u, ".ts")]
    : [];
  const candidates = [
    ...jsDeclarationCandidates,
    input,
    `${input}.d.ts`,
    `${input}.ts`,
    path.join(input, "index.d.ts"),
    path.join(input, "index.ts"),
  ];
  for (const candidate of candidates) {
    try {
      const source = readFileSync(candidate);
      if (source.byteLength >= 0) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error(`Unable to resolve packed declaration ${input}`);
}

function surfaceKey(record) {
  assert.ok(record && typeof record === "object", "API record is invalid");
  assert.equal(typeof record.package, "string", "API package is invalid");
  assert.equal(typeof record.subpath, "string", "API subpath is invalid");
  assert.ok(Array.isArray(record.typeExports), "API exports are invalid");
  return `${record.package}${record.subpath === "." ? "" : `/${record.subpath.slice(2)}`}`;
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
