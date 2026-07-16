import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const packageNames = [
  'a2a',
  'audit',
  'audit-postgres',
  'auth',
  'core',
  'events',
  'framework',
  'interop',
  'mcp',
  'memory',
  'model',
  'model-anthropic',
  'model-gemini',
  'model-openai-compatible',
  'postgres',
  'provider-openai',
  'rooms',
  'rooms-api',
  'rooms-postgres',
  'runtime',
  'runtime-mock',
  'sessions',
  'sessions-redis',
  'streaming',
  'tools',
  'workflows',
];
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentplat-pack-'));
const tarballRoot = path.join(temporaryRoot, 'tarballs');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  for (const packageName of packageNames) {
    execFileSync(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', tarballRoot],
      {
        cwd: path.join(root, 'packages', packageName),
        stdio: 'pipe',
      }
    );
  }

  const tarballs = await readdir(tarballRoot);
  assert.equal(tarballs.length, packageNames.length);

  const dependencies = {};
  for (const packageName of packageNames) {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'packages', packageName, 'package.json'),
        'utf8'
      )
    );
    const tarball = `agentplat-${packageName}-${manifest.version}.tgz`;
    assert.ok(tarballs.includes(tarball), `Missing tarball: ${tarball}`);
    dependencies[`@agentplat/${packageName}`] =
      `file:${path.join(tarballRoot, tarball)}`;
  }

  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    path.join(consumerRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`
  );
  await writeFile(
    path.join(consumerRoot, 'verify.mjs'),
    [
      "import { AgentPlat } from '@agentplat/framework';",
      "import { InMemoryRoomRepository, RoomService } from '@agentplat/rooms';",
      "import { DefaultAgentRuntime } from '@agentplat/runtime';",
      "import { MockAgentProvider } from '@agentplat/runtime-mock';",
      "import { createMultiAgentSession } from '@agentplat/sessions';",
      "import { streamToSSE } from '@agentplat/streaming';",
      'const runtime = new DefaultAgentRuntime();',
      'const service = new RoomService({ repository: new InMemoryRoomRepository(), runtime });',
      "const adapter = { id: 'consumer', capabilities: { streaming: false, tools: false, structuredOutput: false, vision: false }, generate: async () => ({ content: 'ok', finishReason: 'stop' }) };",
      "const result = await AgentPlat.quickRun({ adapter, instructions: 'Test', input: 'hello' });",
      'const mockRuntime = new DefaultAgentRuntime();',
      "mockRuntime.registerProvider('mock', new MockAgentProvider({ responsesByAgent: { a: ['A'], b: ['B'] } }));",
      "const session = createMultiAgentSession({ runtime: mockRuntime, maxRounds: 1, speakers: [{ id: 'a', name: 'A', instructions: 'A', platform: 'mock' }, { id: 'b', name: 'B', instructions: 'B', platform: 'mock' }] });",
      "const sessionResult = await session.run({ input: 'test' });",
      "async function* events() { yield { type: 'completed', content: result.output }; }",
      'const response = streamToSSE(events());',
      "if (!service || result.output !== 'ok' || sessionResult.turnsCompleted !== 2 || !response.headers.get('content-type')?.startsWith('text/event-stream')) process.exit(1);",
      '',
    ].join('\n')
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: consumerRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
      },
    }
  );
  execFileSync(process.execPath, ['verify.mjs'], {
    cwd: consumerRoot,
    stdio: 'pipe',
  });

  console.log(
    `Packed and installed ${tarballs.length} packages in an isolated consumer project.`
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
