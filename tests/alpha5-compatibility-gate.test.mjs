import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("unchanged contract compilation rejects narrowed inputs and changed discriminants", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentplat-api-negative-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "node_modules", "@agentplat", "fixture");
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@agentplat/fixture",
        type: "module",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
      })}\n`,
    ),
    writeFile(
      path.join(root, "consumer.ts"),
      [
        'import { configure } from "@agentplat/fixture";',
        'const result = configure({ mode: "b" });',
        'if (result.kind === "ok") void result;',
        'else { const exhaustive: "retry" = result.kind; void exhaustive; }',
        "",
      ].join("\n"),
    ),
    writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
        },
        include: ["consumer.ts"],
      })}\n`,
    ),
    writeFile(
      path.join(packageRoot, "dist/index.js"),
      "export function configure() { return { kind: 'ok' }; }\n",
    ),
  ]);
  const declaration = path.join(packageRoot, "dist/index.d.ts");
  await writeFile(
    declaration,
    'export declare function configure(input: { mode: "a" | "b" }): { kind: "ok" } | { kind: "retry" };\n',
  );
  assert.doesNotThrow(() => compile(root));

  await writeFile(
    declaration,
    'export declare function configure(input: { mode: "a" }, required: string): { kind: "ok" } | { kind: "retry" } | { kind: "fatal" };\n',
  );
  assert.throws(() => compile(root), /Command failed/u);
});

function compile(root) {
  execFileSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules/typescript/bin/tsc"), "-p", "."],
    { cwd: root, stdio: "pipe" },
  );
}
