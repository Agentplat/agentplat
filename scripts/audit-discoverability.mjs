import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { output: { type: 'string' } } });
const urls = ['https://agentplat.com/', 'https://www.agentplat.com/', 'https://agentplat.com/robots.txt', 'https://agentplat.com/sitemap.xml', 'https://agentplat.com/llms.txt', 'https://doc.agentplat.com/', 'https://doc.agentplat.com/robots.txt', 'https://doc.agentplat.com/sitemap.xml', 'https://doc.agentplat.com/llms.txt', 'https://doc.agentplat.com/ai/context.md', 'https://doc.agentplat.com/when-to-use-agentplat', 'https://doc.agentplat.com/getting-started/persistent-collaboration', 'https://doc.agentplat.com/getting-started/human-approval', 'https://doc.agentplat.com/getting-started/recover-agent-coordination'];
const expectedTitles = {
  'https://doc.agentplat.com/when-to-use-agentplat': 'When to use AgentPlat',
  'https://doc.agentplat.com/getting-started/persistent-collaboration': 'Build persistent human-agent collaboration in TypeScript',
  'https://doc.agentplat.com/getting-started/human-approval': 'Add human approval to a multi-agent workflow',
  'https://doc.agentplat.com/getting-started/recover-agent-coordination': 'Resume agent coordination after a process failure',
};
const observations = [];
// Sequential requests bound load on the two public sites.
for (const url of urls) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'AgentPlatDiscoverabilityAudit/1.0' } });
    const body = await response.text();
    const html = /text\/html/i.test(response.headers.get('content-type') ?? '');
    const title = html ? body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null : null;
    const canonical = html ? body.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)/i)?.[1] ?? null : null;
    const description = html ? body.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["']([^"']*)/i)?.[1] ?? null : null;
    const robotsMeta = html ? body.match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*\bcontent=["']([^"']*)/i)?.[1] ?? null : null;
    const isTextResource = /\.(txt|xml|md)$/.test(new URL(url).pathname);
    observations.push({ url, finalUrl: response.url, status: response.status, contentType: response.headers.get('content-type'), xRobotsTag: response.headers.get('x-robots-tag'), title, description, canonical, robotsMeta, expectedResourceReturned: response.ok && !(isTextResource && html) && (!expectedTitles[url] || Boolean(title?.startsWith(expectedTitles[url]))), expectedTitlePrefix: expectedTitles[url] ?? null, ...(url.endsWith('/robots.txt') ? { robotsText: html ? null : body.slice(0, 12000) } : {}) });
  } catch (error) { observations.push({ url, error: error.message, expectedResourceReturned: false }); }
}
const result = { observedAt: new Date().toISOString(), method: 'Direct HTTP fetch, custom audit user agent. Does not measure search indexing or crawler-specific firewall access. A 200 HTML fallback is not a valid text resource.', observations };
const json = JSON.stringify(result, null, 2) + '\n';
if (values.output) await writeFile(values.output, json, { flag: 'wx' });
else console.log(json);
console.error(`Audited ${observations.length} URLs; ${observations.filter(o => !o.expectedResourceReturned).length} unavailable or unexpected resources.`);
