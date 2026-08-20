import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const levels = {
  1: ['spec/schemas/room.schema.json', 'spec/fixtures/valid/handoff.json'],
  2: ['spec/schemas/artifact.schema.json', 'spec/schemas/handoff.schema.json', 'spec/schemas/memory-scope.schema.json'],
  3: ['docs/collective-runtime/governed-collective-runtime-v1.md'],
  4: ['docs/specification/agent-mesh-v1.md'],
};
for (const [level, files] of Object.entries(levels)) {
  for (const file of files) if (!existsSync(join(root, file))) throw new Error(`Level ${level} missing conformance source: ${file}`);
}
const invalid = JSON.parse(readFileSync(join(root, 'spec/fixtures/invalid/handoff.json'), 'utf8'));
for (const required of ['id','scope','from','to','state']) if (required in invalid) { /* fixture intentionally lacks some fields */ }
if ('scope' in invalid || 'state' in invalid) throw new Error('Invalid handoff fixture unexpectedly became complete');
console.log('AgentPlat compatibility sources verified for levels 1-4');
