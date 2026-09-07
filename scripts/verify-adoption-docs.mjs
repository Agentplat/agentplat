import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
const manifest = JSON.parse(await read("package.json"));
const example = JSON.parse(await read("examples/rooms-api/package.json"));
const guides = (await readdir(path.join(root, "docs/getting-started")))
  .filter((f) => f.endsWith(".md"))
  .map((f) => `docs/getting-started/${f}`);
const documents = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/component-maturity.md",
  "docs/capability-catalog.md",
  "examples/rooms-api/README.md",
  ...guides,
];
for (const document of documents) {
  const content = await read(document);
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    await access(
      path.resolve(root, path.dirname(document), decodeURIComponent(target)),
    );
  }
  if (
    document === "docs/capability-catalog.md" ||
    document === "examples/rooms-api/README.md"
  )
    continue;
  for (const [, prefix, name] of content.matchAll(
    /(?:corepack )?pnpm (?:--dir (examples\/rooms-api) )?(?:run )?([\w]+:[\w:-]+)/g,
  )) {
    assert.ok(
      (prefix ? example : manifest).scripts[name],
      `${document}: unknown command ${name}`,
    );
  }
}
const readme = await read("README.md");
assert.ok(
  readme.trimEnd().split("\n").length <= 200,
  "README must stay within 200 lines",
);
const firstExecution = readme
  .split("\n")
  .findIndex((line) => line.includes("run example:quick"));
assert.ok(
  firstExecution >= 0 && firstExecution < 80,
  "First execution must exist within the first 80 lines",
);
const catalog = await read("docs/capability-catalog.md");
for (const [, heading] of catalog.matchAll(/^#{2,3} (.+)$/gm)) {
  const anchor = heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replaceAll(" ", "-");
  assert.ok(
    readme.includes(`<a id="${anchor}"></a>`),
    `Missing historical README destination: ${anchor}`,
  );
}
const exportsToCheck = {
  framework: ["AgentPlat"],
  rooms: ["RoomService", "AgentRoomCoordinationRuntime"],
  "rooms-api": ["createRoomsApp"],
  "rooms-postgres": ["PostgresRoomRepository"],
  runtime: ["DefaultAgentRuntime", "ChatAgentProvider"],
  "runtime-mock": ["MockAgentProvider"],
  "model-openai-compatible": ["chatModel"],
};
for (const [directory, names] of Object.entries(exportsToCheck)) {
  const pkg = JSON.parse(await read(`packages/${directory}/package.json`));
  assert.ok(pkg.exports["."], `${pkg.name}: missing public root`);
  const imported = await import(pkg.name);
  for (const name of names)
    assert.ok(name in imported, `${pkg.name}: missing ${name}`);
}
console.log(
  `Adoption structure verified: ${documents.length} documents and public runtime exports. This is not a maturity certification.`,
);
