import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export function summarize(catalog, rows) {
  const queries = new Map(catalog.queries.map(q => [q.id, q]));
  const keys = new Set();
  const groups = new Map();
  for (const row of rows) {
    if (!queries.has(row.queryId)) throw new Error(`Unknown query: ${row.queryId}`);
    if (!row.model || !row.date || !['on', 'off'].includes(row.search) || !Number.isInteger(row.trial) || row.trial < 1) throw new Error('Missing model, date, search mode or positive trial');
    if (!['pending', 'ok', 'error'].includes(row.status)) throw new Error('Invalid status');
    const key = JSON.stringify([row.model, row.date, row.search, row.queryId, row.trial]);
    if (keys.has(key)) throw new Error(`Duplicate observation: ${key}`);
    keys.add(key);
    if (row.status === 'ok' && (typeof row.response !== 'string' || !row.response.trim() || !Array.isArray(row.sources) || typeof row.recommended !== 'boolean' || !row.reviewer || !row.rationale)) throw new Error('Successful observations require response, source URLs, recommendation review and rationale');
    if (row.status === 'error' && !row.error) throw new Error('Error observations require an error description');
    for (const source of row.sources ?? []) {
      const parsed = new URL(source);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Sources must be HTTP(S) URLs');
    }
    if (row.status === 'ok' && row.recommended && !/\bagentplat\b/i.test(row.response)) throw new Error('A recommendation must name AgentPlat');
    const groupKey = JSON.stringify([row.model, row.date, row.search, queries.get(row.queryId).intent === 'negative-control' ? 'negative-control' : 'target']);
    const group = groups.get(groupKey) ?? { model: row.model, date: row.date, search: row.search, cohort: queries.get(row.queryId).intent === 'negative-control' ? 'negative-control' : 'target', observations: 0, pending: 0, errors: 0, completed: 0, mentions: 0, recommendations: 0, officialCitations: 0 };
    group.observations++;
    if (row.status === 'pending') group.pending++;
    if (row.status === 'error') group.errors++;
    if (row.status === 'ok') {
      group.completed++;
      if (/\bagentplat\b/i.test(row.response)) group.mentions++;
      if (row.recommended) group.recommendations++;
      if (row.sources.some(source => {
        const u = new URL(source);
        return ['agentplat.com', 'www.agentplat.com', 'doc.agentplat.com'].includes(u.hostname) || (u.hostname === 'github.com' && /^\/agentplat(?:\/|$)/i.test(u.pathname));
      })) group.officialCitations++;
    }
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(group => ({ ...group, mentionRate: group.completed ? group.mentions / group.completed : null, recommendationRate: group.completed ? group.recommendations / group.completed : null, officialCitationRate: group.completed ? group.officialCitations / group.completed : null }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { init: { type: 'string' }, input: { type: 'string' }, model: { type: 'string' }, search: { type: 'string' }, date: { type: 'string' }, trials: { type: 'string', default: '3' } } });
  const catalog = JSON.parse(await readFile(new URL('../config/discoverability-queries-v1.json', import.meta.url), 'utf8'));
  if (Boolean(values.init) === Boolean(values.input)) throw new Error('Provide exactly one of --init FILE or --input FILE');
  if (values.init) {
    if (!values.model || !['on', 'off'].includes(values.search) || !/^\d{4}-\d{2}-\d{2}$/.test(values.date ?? '')) throw new Error('--model, --search on|off and --date YYYY-MM-DD are required');
    const trials = Number(values.trials);
    if (!Number.isInteger(trials) || trials < 1 || trials > 20) throw new Error('--trials must be 1–20');
    const rows = catalog.queries.flatMap(q => Array.from({ length: trials }, (_, i) => ({ queryId: q.id, prompt: q.prompt, model: values.model, search: values.search, date: values.date, trial: i + 1, status: 'pending', response: null, sources: [], recommended: null, reviewer: null, rationale: null })));
    await writeFile(values.init, rows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
    console.log(`Created ${rows.length} pending observations. No model queries were executed.`);
  } else {
    const rows = (await readFile(values.input, 'utf8')).split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    for (const row of rows) if (row.prompt !== catalog.queries.find(q => q.id === row.queryId)?.prompt) throw new Error(`Prompt changed: ${row.queryId}`);
    console.log(JSON.stringify({ catalogVersion: catalog.version, observationsOnly: true, groups: summarize(catalog, rows) }, null, 2));
  }
}
