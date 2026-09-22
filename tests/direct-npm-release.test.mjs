import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  assertDirectReleaseContext,
  publishDirectNpmRelease,
  publicationOrder,
  DIRECT_WORKFLOW,
} from "../scripts/publish-direct-npm-release.mjs";
import { validateRegistryPackageEvidence } from "../scripts/verify-npm-release-provenance.mjs";
const canonical = (x) =>
  x === null || typeof x !== "object"
    ? JSON.stringify(x)
    : Array.isArray(x)
      ? "[" + x.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
          .join(",") +
        "}";
const sha = (b) => "sha512-" + createHash("sha512").update(b).digest("base64");
const environment = () => ({
  AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED: "true",
  AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_REPOSITORY: "Agentplat/agentplat",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_WORKFLOW_REF: `Agentplat/agentplat/${DIRECT_WORKFLOW}@refs/heads/main`,
  GITHUB_ACTOR: "douglas-grishen",
  GITHUB_ACTOR_ID: "207043696",
  GITHUB_TRIGGERING_ACTOR: "douglas-grishen",
  GITHUB_SHA: "a".repeat(40),
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://fixture.invalid/oidc",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-only",
  NPM_DIST_TAG: "next",
});
async function fixture(t, { hooks = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "direct-release-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "release-artifacts");
  await mkdir(dir);
  await mkdir(path.join(root, "config"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ version: "1.2.3-beta.1" }),
  );
  const packages = ["alpha", "zeta"].map((n) => ({
    name: "@agentplat/" + n,
    directory: "packages/" + n,
    layer: "runtime",
    publish: true,
    packSmoke: true,
    providerNeutral: true,
    browserEntrypoints: [],
  }));
  await writeFile(
    path.join(root, "config/public-packages.json"),
    JSON.stringify({ schemaVersion: 2, packages }),
  );
  const artifacts = [],
    contents = new Map();
  for (const p of packages) {
    const temp = path.join(root, p.name.split("/")[1]);
    await mkdir(path.join(temp, "package"), { recursive: true });
    await writeFile(
      path.join(temp, "package/package.json"),
      JSON.stringify({
        name: p.name,
        version: "1.2.3-beta.1",
        ...(p.name.endsWith("alpha")
          ? { dependencies: { "@agentplat/zeta": "1.2.3-beta.1" } }
          : {}),
        ...(hooks && p.name.endsWith("zeta")
          ? { scripts: { prepublishOnly: "do-not-run" } }
          : {}),
      }),
    );
    const filename =
      p.name.replace(/^@/u, "").replaceAll("/", "-") + "-1.2.3-beta.1.tgz";
    execFileSync("tar", [
      "-czf",
      path.join(dir, filename),
      "-C",
      temp,
      "package",
    ]);
    const bytes = await readFile(path.join(dir, filename));
    contents.set(p.name, bytes);
    artifacts.push({
      name: p.name,
      filename,
      version: "1.2.3-beta.1",
      size: bytes.length,
      integrity: sha(bytes),
    });
  }
  const body = {
    schemaVersion: 1,
    kind: "agentplat-npm-release-artifacts-v1",
    sourceCommit: "a".repeat(40),
    releaseVersion: "1.2.3-beta.1",
    scope: "all",
    distTag: "next",
    artifacts,
  };
  const manifest = {
    ...body,
    manifestDigest:
      "sha256-" + createHash("sha256").update(canonical(body)).digest("base64"),
  };
  await writeFile(
    path.join(dir, "npm-release-artifacts-v1.json"),
    JSON.stringify(manifest),
  );
  return { root, dir, manifest, contents };
}
const freshRegistry = async (url) => ({
  ok: true,
  status: 200,
  json: async () => ({
    name: decodeURIComponent(new URL(url).pathname.slice(1)),
    versions: {},
    "dist-tags": { next: "1.2.2" },
  }),
});
function executor(calls, { fail = false } = {}) {
  return (command, args, opts) => {
    assert.equal(command, "npm");
    if (args[0] === "--version") return { stdout: "11.19.0\n" };
    calls.push({ args, opts });
    if (fail) throw Error("simulated registry failure");
    return { stdout: "" };
  };
}

test("direct publishing is opt-in and scoped to the owner, main, exact workflow and OIDC", () => {
  assert.doesNotThrow(() => assertDirectReleaseContext(environment()));
  for (const [key, value] of Object.entries({
    AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED: undefined,
    AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED: "false",
    GITHUB_REF: "refs/heads/topic",
    GITHUB_REF_PROTECTED: "false",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_ACTOR_ID: "1",
    GITHUB_ACTOR: "other",
    GITHUB_TRIGGERING_ACTOR: "other",
    GITHUB_REPOSITORY: "other/repo",
    RUNNER_ENVIRONMENT: "self-hosted",
    GITHUB_WORKFLOW_REF:
      "Agentplat/agentplat/.github/workflows/release.yml@refs/heads/main",
    GITHUB_SHA: "invalid",
    NODE_AUTH_TOKEN: "forbidden",
    NPM_TOKEN: "forbidden",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined,
    NPM_DIST_TAG: "surprise",
  }))
    assert.throws(
      () => assertDirectReleaseContext({ ...environment(), [key]: value }),
      key,
    );
});

test("publishes only exact tarballs, dependencies first, from a credential-free working directory", async (t) => {
  const f = await fixture(t),
    calls = [];
  const result = await publishDirectNpmRelease({
    ...f,
    environment: environment(),
    fetchImplementation: freshRegistry,
    execute: executor(calls),
  });
  assert.equal(result.packages.length, 2);
  assert(calls[0].args[1].includes("agentplat-zeta-"));
  assert(calls[1].args[1].includes("agentplat-alpha-"));
  for (const c of calls) {
    assert.equal(c.args[0], "publish");
    assert(c.args.includes("--ignore-scripts"));
    assert(c.args.includes("--provenance"));
    assert(c.args.includes("--registry=https://registry.npmjs.org/"));
    assert.equal(c.opts.environment.NPM_CONFIG_USERCONFIG, "/dev/null");
    assert.equal(c.opts.environment.NPM_CONFIG_GLOBALCONFIG, "/dev/null");
    assert.notEqual(c.opts.cwd, f.root);
    assert.notEqual(c.opts.cwd, f.dir);
  }
});

for (const fault of [
  "tamper",
  "missing",
  "symlink",
  "extra",
  "wrong-commit",
  "wrong-version",
  "hooks",
])
  test(`the entire cohort is checked before publishing: ${fault}`, async (t) => {
    const f = await fixture(t, { hooks: fault === "hooks" }),
      calls = [];
    const file = path.join(f.dir, f.manifest.artifacts.at(-1).filename);
    if (fault === "tamper") await writeFile(file, "changed");
    if (fault === "missing") await rm(file);
    if (fault === "symlink") {
      const original = await readFile(file);
      await rm(file);
      const other = path.join(f.root, "target");
      await writeFile(other, original);
      await symlink(other, file);
    }
    if (fault === "extra")
      await writeFile(path.join(f.dir, "unexpected"), "extra");
    if (fault === "wrong-version")
      await writeFile(path.join(f.root, "package.json"), '{"version":"9.9.9"}');
    const e = environment();
    if (fault === "wrong-commit") e.GITHUB_SHA = "b".repeat(40);
    await assert.rejects(
      publishDirectNpmRelease({
        ...f,
        environment: e,
        fetchImplementation: freshRegistry,
        execute: executor(calls),
      }),
    );
    assert.equal(calls.length, 0);
  });

test("registry uncertainty stops the release before any mutation", async (t) => {
  const f = await fixture(t),
    calls = [];
  await assert.rejects(
    publishDirectNpmRelease({
      ...f,
      environment: environment(),
      fetchImplementation: async () => ({ ok: false, status: 503 }),
      execute: executor(calls),
    }),
  );
  assert.equal(calls.length, 0);
});

test("a publish failure stops before dependent packages", async (t) => {
  const f = await fixture(t),
    calls = [];
  await assert.rejects(
    publishDirectNpmRelease({
      ...f,
      environment: environment(),
      fetchImplementation: freshRegistry,
      execute: executor(calls, { fail: true }),
    }),
    /simulated registry failure/,
  );
  assert.equal(calls.length, 1);
  assert(calls[0].args[1].includes("zeta"));
});

test("cycles and omitted internal dependencies fail closed", () => {
  assert.throws(
    () =>
      publicationOrder([
        { name: "@agentplat/a", dependencies: { "@agentplat/b": "1" } },
        { name: "@agentplat/b", dependencies: { "@agentplat/a": "1" } },
      ]),
    /cycle/,
  );
  assert.throws(
    () =>
      publicationOrder([
        { name: "@agentplat/a", dependencies: { "@agentplat/missing": "1" } },
      ]),
    /unpublished/,
  );
});

function registryEvidence(a, commit, bytes) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const key = pair.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  const keys = {
    keys: [
      {
        keyid: "fixture",
        keytype: "ecdsa-sha2-nistp256",
        scheme: "ecdsa-sha2-nistp256",
        key,
        expires: null,
      },
    ],
  };
  const sig = sign(
    "sha256",
    Buffer.from(`${a.name}@${a.version}:${a.integrity}`),
    pair.privateKey,
  ).toString("base64");
  const envelope = (payload) => ({
    bundle: {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
      },
    },
  });
  const attestations = {
    attestations: [
      envelope({
        predicateType:
          "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
      }),
      envelope({
        predicateType: "https://slsa.dev/provenance/v1",
        subject: [
          {
            name: `pkg:npm/${a.name.replace(/^@/u, "%40")}@${a.version}`,
            digest: {
              sha512: Buffer.from(a.integrity.slice(7), "base64").toString(
                "hex",
              ),
            },
          },
        ],
        predicate: {
          buildDefinition: {
            buildType:
              "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
            externalParameters: {
              workflow: {
                ref: "refs/heads/main",
                repository: "https://github.com/Agentplat/agentplat",
                path: DIRECT_WORKFLOW,
              },
            },
            resolvedDependencies: [{ digest: { gitCommit: commit } }],
          },
          runDetails: {
            builder: { id: "https://github.com/actions/runner/github-hosted" },
          },
        },
      }),
    ],
  };
  return {
    keys,
    attestations,
    packument: {
      name: a.name,
      versions: {
        [a.version]: {
          dist: {
            integrity: a.integrity,
            signatures: [{ keyid: "fixture", sig }],
            attestations: { url: "https://registry.npmjs.org/attestation" },
            tarball: "https://registry.npmjs.org/archive.tgz",
          },
        },
      },
      "dist-tags": { next: a.version },
    },
    bytes,
  };
}
for (const corrupt of [false, "bytes", "commit", "tag", "origin", "signature"])
  test(`resume validates immutable registry evidence (${corrupt || "valid"})`, async (t) => {
    const f = await fixture(t),
      calls = [];
    const a = f.manifest.artifacts.find((a) => a.name.endsWith("zeta"));
    const e = registryEvidence(
      a,
      corrupt === "commit" ? "b".repeat(40) : f.manifest.sourceCommit,
      f.contents.get(a.name),
    );
    if (corrupt === "signature")
      e.packument.versions[a.version].dist.signatures[0].sig =
        Buffer.alloc(64).toString("base64");
    if (corrupt === "tag") e.packument["dist-tags"].next = "9.9.9";
    if (corrupt === "origin")
      e.packument.versions[a.version].dist.attestations.url =
        "https://untrusted.invalid/evidence";
    const fetchImplementation = async (url) => {
      if (url === "https://registry.npmjs.org/-/npm/v1/keys")
        return { ok: true, json: async () => e.keys };
      if (url === "https://registry.npmjs.org/attestation")
        return { ok: true, json: async () => e.attestations };
      if (url === "https://registry.npmjs.org/archive.tgz")
        return {
          ok: true,
          arrayBuffer: async () =>
            corrupt === "bytes" ? Buffer.from("bad") : e.bytes,
        };
      if (decodeURIComponent(new URL(url).pathname.slice(1)) === a.name)
        return { ok: true, json: async () => e.packument };
      return freshRegistry(url);
    };
    const action = () =>
      publishDirectNpmRelease({
        ...f,
        environment: environment(),
        fetchImplementation,
        execute: executor(calls),
      });
    if (corrupt) {
      await assert.rejects(action);
      assert.equal(calls.length, 0);
    } else {
      const r = await action();
      assert.equal(calls.length, 1);
      assert(calls[0].args[1].includes("alpha"));
      assert.equal(r.packages[0].status, "verified-existing");
    }
  });

test("the workflow keeps preparation unprivileged, publication gated and registry consumers mandatory", async () => {
  const text = await readFile(
    new URL("../.github/workflows/release-direct.yml", import.meta.url),
    "utf8",
  );
  const prepare = text.split("\n  prepare:")[1].split("\n  publish:")[0];
  const publish = text.split("\n  publish:")[1].split("\n  verify:")[0];
  const verify = text.split("\n  verify:")[1];
  assert.match(text, /dry_run:[\s\S]*?default: true/);
  assert.match(
    prepare,
    /inputs\.dry_run \|\| vars\.AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED == 'true'/,
  );
  assert.doesNotMatch(prepare, /id-token: write/);
  assert.match(prepare, /pnpm run check/);
  assert.match(prepare, /pnpm run verify:pack/);
  assert.match(publish, /needs: prepare/);
  assert.match(publish, /environment: npm-release/);
  assert.match(publish, /AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED/);
  assert.doesNotMatch(publish, /pnpm install|npm install|pnpm run build/);
  assert.match(verify, /needs: publish/);
  assert.doesNotMatch(verify, /id-token: write/);
  assert.match(verify, /verify-npm-release-provenance/);
  assert.match(verify, /AGENTPLAT_REGISTRY_CONSUMER_PROFILE: postgres/);
  assert.match(verify, /node-version: 22\.22\.0/);
});
