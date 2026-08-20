import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type DocsRequest = { method: string; params?: Record<string, unknown> };
export type DocsResponse = { ok: true; result: unknown } | { ok: false; error: string };

const RESOURCE_FILES: Record<string, string> = {
  'agentplat://docs/architecture': 'docs/architecture.md',
  'agentplat://docs/agent-rooms': 'docs/agent-rooms.md',
  'agentplat://docs/ai-context': 'docs/ai/context.md',
  'agentplat://docs/examples': 'docs/examples.md',
  'agentplat://spec/agentplat-v1': 'docs/specification/agentplat-spec-v1.md',
  'agentplat://spec/agent-mesh': 'docs/specification/agent-mesh-v1.md',
  'agentplat://research/capability-evidence': 'config/collective-capability-baseline-current.json',
};

const TERMS: Record<string, string> = {
  'agent room': 'docs/agent-rooms.md',
  'agentplat agent room': 'docs/specification/agent-rooms-v1.md',
  'handoff': 'docs/specification/handoff-v1.md',
  'collective runtime': 'docs/collective-runtime/governed-collective-runtime-v1.md',
  'agent mesh': 'docs/specification/agent-mesh-v1.md',
  'inference control': 'docs/inference-control/',
  'evidence boundary': 'docs/ai/context.md',
};

function repoRoot(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.AGENTPLAT_ROOT) return process.env.AGENTPLAT_ROOT;
  return existsSync(join(process.cwd(), 'README.md')) ? process.cwd() : join(process.cwd(), '../..');
}
function read(root: string, file: string): string {
  const path = join(root, file);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Canonical source not found: ${file}`);
  return readFileSync(path, 'utf8');
}
function walk(root: string, dir: string, output: string[] = []): string[] {
  const path = join(root, dir);
  if (!existsSync(path)) return output;
  for (const entry of readdirSync(path)) {
    const rel = join(dir, entry); const full = join(root, rel);
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    statSync(full).isDirectory() ? walk(root, rel, output) : output.push(rel);
  }
  return output;
}

export function handleRequest(request: DocsRequest, root = repoRoot()): DocsResponse {
  try {
    if (request.method === 'resources/list') return { ok: true, result: Object.keys(RESOURCE_FILES).map(uri => ({ uri, name: uri.replace('agentplat://', '') })) };
    if (request.method === 'resources/read') {
      const uri = String(request.params?.uri ?? ''); const file = RESOURCE_FILES[uri];
      if (!file) throw new Error(`Unknown resource: ${uri}`);
      return { ok: true, result: { uri, mimeType: file.endsWith('.json') ? 'application/json' : 'text/markdown', text: read(root, file), source: file } };
    }
    if (request.method === 'tools/list') return { ok: true, result: { tools: ['search_agentplat_docs','get_concept','get_spec','find_code_example','get_package_api','map_requirements','get_validation_status','get_citation'] } };
    if (request.method !== 'tools/call') throw new Error(`Unsupported method: ${request.method}`);
    const name = String(request.params?.name ?? ''); const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
    if (name === 'get_concept') {
      const concept = String(args.name ?? '').toLowerCase(); const source = TERMS[concept];
      if (!source) throw new Error(`Unknown concept: ${concept}`);
      return { ok: true, result: { concept, source, content: read(root, source.endsWith('/') ? 'docs/architecture.md' : source) } };
    }
    if (name === 'get_spec') return { ok: true, result: { source: 'docs/specification/agentplat-spec-v1.md', content: read(root, 'docs/specification/agentplat-spec-v1.md') } };
    if (name === 'get_citation') return { ok: true, result: { source: 'CITATION.cff', content: read(root, 'CITATION.cff') } };
    if (name === 'get_validation_status') return { ok: true, result: { source: 'config/collective-capability-baseline-current.json', content: read(root, 'config/collective-capability-baseline-current.json'), note: 'Implementation is not equivalent to production-scale empirical validation.' } };
    if (name === 'search_agentplat_docs') {
      const query = String(args.query ?? '').toLowerCase(); const files = walk(root, 'docs').filter(f => /\.md$|\.json$/.test(f));
      const matches = files.map(file => ({ file, content: read(root, file) })).filter(x => x.content.toLowerCase().includes(query)).slice(0, Number(args.limit ?? 10));
      return { ok: true, result: matches.map(x => ({ source: x.file, excerpt: x.content.slice(Math.max(0, x.content.toLowerCase().indexOf(query)-120), x.content.toLowerCase().indexOf(query)+500) })) };
    }
    if (name === 'find_code_example') return { ok: true, result: { query: args.topic ?? '', sources: walk(root, 'examples').filter(f => /\.m?js$|README\.md$/.test(f)).slice(0, 50) } };
    if (name === 'get_package_api') return { ok: true, result: { package: args.package ?? '', source: 'packages/*/README.md', note: 'Use the package README and exported declarations for the exact API.' } };
    if (name === 'map_requirements') {
      const requirements = Array.isArray(args.requirements) ? args.requirements.map(String) : [];
      const recommendations = requirements.flatMap(r => { const q = r.toLowerCase(); if (q.includes('distributed')) return [{ component:'AgentPlat Agent Mesh', maturity:'implemented', source:'docs/specification/agent-mesh-v1.md', limitation:'Review compatibility and evidence before deployment.' }]; if (q.includes('persistent') || q.includes('room')) return [{ component:'AgentPlat Agent Room', maturity:'implemented', source:'docs/specification/agent-rooms-v1.md', limitation:'Storage and authorization depend on adapters.' }]; if (q.includes('memory')) return [{ component:'Scoped memory', maturity:'implemented', source:'docs/memory.md', limitation:'Retrieval policy remains application-specific.' }]; return [{ component:'AgentPlat Collective Runtime', maturity:'implemented', source:'docs/collective-runtime/', limitation:'Consult the capability baseline.' }]; });
      return { ok: true, result: { requirements, recommendations } };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
