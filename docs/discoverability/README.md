# AgentPlat discoverability workstream

Started: 2026-09-07. Public content is English. The objective is to make AgentPlat
findable, understandable and appropriately selectable for real developer needs.
No inclusion in model training, recommendation placement or traffic gain is guaranteed.

## Delivery and acceptance

| Work | Acceptance | Current state |
| --- | --- | --- |
| Consistent positioning | Website, documentation, repository and organization profile explain the same TypeScript collaboration use case | Source changes prepared; publication is tracked separately |
| Three practical guides | Collaboration, approval and process recovery have runnable examples and bounded claims | Written; existing PostgreSQL integration scenarios passed on 2026-09-07 |
| Selection guidance | Dated official-source comparison, adoption obligations and poor-fit cases | Written; LangGraph and Mastra documentation reviewed on 2026-09-07; no comparative runtime benchmark |
| Adoption evidence | Reproducible reference case; named claims require permission and measured results | Reference case written; named customer evidence and independent reports pending |
| Technical discovery | Valid robots, sitemaps, canonical URLs, links and meaningful HTTP responses | Initial audit recorded; source fixes and docs build passed; production verification pending |
| Measurement | Frozen 20-query catalog, repeated clean sessions, separate search modes and recorded sources | Protocol and scorer implemented; independent assistant baseline pending |

The main source checkout already contained adoption examples and unrelated
release/dependency work when this workstream started. Preserve it. Do not publish
new guide links before their source examples and required commands are available
at the referenced revision. Deployment of a page is not proof of indexing.

## Initial HTTP findings

See [the raw HTTP baseline](http-baseline-2026-09-07.json). This is direct HTTP
observation, not Search Console or a model-recommendation result.

- The website root and `www` root returned the same content without a canonical URL.
- The website sitemap returned 404.
- Documentation `robots.txt` and `sitemap.xml` returned the homepage as HTML with 200.
- New guide paths also returned the homepage title with 200 before publication;
  a successful status alone cannot establish that a route exists.
- Both llms indexes and the documentation Markdown context were accessible.

Re-run without overwriting historical observations:

```sh
node scripts/audit-discoverability.mjs --output output/discoverability-http-after.json
```

Inspect the expected title/canonical as well as status and media type. Verify
crawler-specific access in hosting logs, sitemap submission and indexing through
the owner's Search Console property. This workspace has no verified Search
Console access; no submission or indexing improvement is claimed.

## Measure recommendations

Use [the measurement protocol](measurement.md). The
[query catalog](../../config/discoverability-queries-v1.json) includes 18 target
questions and 2 negative controls. The scripts make no model calls and spend no
provider credits. Pending observations are never scored as successes.

## Evidence and distribution

Use [the customer case template](customer-case-template.md) to prepare an approved,
sourced report. Until then, publish the [reference scenario](../evidence-for-adopters.md).
The existing [developer pilot](../getting-started/adoption-pilot.md) supplies the
participant protocol; do not represent pending sessions as completed research.

Publish substantive implementation tutorials where developers already discuss
these problems, disclosing authorship and affiliation. Propose integrations or
curated-directory entries only where their contribution rules and scope fit.
Do not buy mentions, invent users, claim vendor endorsement from generated model
text, or flood forums with duplicate articles. Contacting people requires the
owner's explicit authorization; this workstream has not sent outreach.

## Follow-through

1. Integrate and publish the source/examples, documentation and website in that order.
2. Recheck deployed URLs and clean-route behavior; retain the HTTP result.
3. Submit both sitemaps in the existing verified Search Console property and inspect the three guides.
4. Run the first clean-session assistant measurement and store raw responses before scoring.
5. Obtain an authorized case source and run the external developer pilot when participants are available.
6. Repeat the same measurement monthly; report observation counts, errors and conversions as well as rates.

For conversion measurement, count guide visits and aggregate demo-start/completion
signals only through an explicitly configured analytics mechanism. Local demo
execution is not currently reported to the project; do not infer adoption from
page views or send participant data without agreement.
