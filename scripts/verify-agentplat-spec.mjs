import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const spec = JSON.parse(readFileSync(join(root, 'spec/agentplat-spec-v1.json'), 'utf8'));
if (spec.version !== '1.0.0' || spec.status !== 'specified') throw new Error('Invalid AgentPlat specification metadata');
for (const file of ['AGENTS.md','CLAUDE.md','AI.md','docs/ai/context.md','CITATION.cff','spec/schemas/artifact.schema.json','spec/schemas/handoff.schema.json','spec/schemas/room.schema.json','spec/schemas/memory-scope.schema.json']) {
  if (!existsSync(join(root, file))) throw new Error(`Missing canonical artifact: ${file}`);
}
const terms = spec.canonicalTerms;
if (new Set(terms).size !== terms.length) throw new Error('Duplicate canonical term');
console.log(`AgentPlat specification v${spec.version}: ${terms.length} canonical terms verified`);
