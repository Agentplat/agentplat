# @agentplat/assessor-typesafe

Optional Jev assessor adapter for `@agentplat/inference-control`. This package
is currently available in the AgentPlat source workspace and is not yet
published to npm. It requires a TypeSafe API key only when its assessor is
constructed and invoked; portable AgentPlat packages do not import it.

After a coordinated AgentPlat release publishes the adapter, install it only
when the application chooses Jev:

```sh
pnpm add @agentplat/assessor-typesafe @agentplat/inference-control
```

The application provides the state projection, typed questions and mapping from
answers to an existing assessor disposition. That mapping is application policy;
model output and confidence do not grant capabilities or approvals.

```ts
import { TypeSafeAssessorV1 } from '@agentplat/assessor-typesafe';

const assessor = new TypeSafeAssessorV1({
  assessorId: 'proposal-review',
  assessorVersion: 1,
  assessorBindingDigest: assessmentBinding.assessorBindingDigest,
  apiKey: process.env.TYPESAFE_API_KEY!,
  // Optional API root override must use HTTPS.
  // baseURL: 'https://api.typesafe.ai',
  model: 'jev-latest',
  timeoutMs: 5_000,
  buildRequest: (request) => ({
    state: {
      content: request.content,
      targetDigest: request.targetDigest,
      checkpoint: request.checkpoint,
    },
    questions: {
      review: {
        type: 'choice',
        instructions: 'Does the submitted work meet the configured requirements?',
        criteria: {
          ready: 'Requirements are covered by the supplied evidence',
          review: 'Evidence is incomplete or ambiguous',
        },
      },
    },
  }),
  mapResult: (result) => ({
    disposition: result.answers.review.choice === 'ready' ? 'allow' : 'escalate',
    reasonCode: 'proposal_review_result',
  }),
  // applicationAudit is supplied by the consuming application.
  evidenceSink: async (record) => auditStore.append(record),
});
```

The API key must stay on the server. Build requests from content the calling
application is authorized to share; this adapter does not fetch Room data or
filter tenant context. Configure a fixed model identifier where reproducibility
matters. `confidence` is provider metadata, not a measured accuracy guarantee.

The adapter bounds request/response bytes, concurrent calls and total duration.
Retries are bounded (zero by default); pass an `AbortSignal` to the generic
decision client's `evaluate` method to cancel an in-flight call. Errors propagate
to the caller; they never become an `allow` assessment. The controlled runtime
reports an assessment failure as a failed run. Observation mode changes how
assessment dispositions affect output; it does not turn a provider error into a
successful assessment.

For a conservative Jev spend cap, set `maxSpendUsd`,
`inputPriceUsdPerMillionTokens` and `maxInputTokensPerCall` together. Before each
call the client reserves `price × token-limit × (retries + 1)`; it never refunds
that reservation after failures because an interrupted provider request may
still have incurred a charge. The cap depends on the model's current price and
context limit, which the application must verify with TypeSafe. Before sending,
the client also rejects a serialized request whose UTF-8 byte length exceeds
that token bound. This is a conservative payload check, not an exact tokenizer
or a guarantee about undisclosed provider-side overhead; configure headroom.

`TypeSafeAssessorV1` also accepts an optional evidence sink. It receives a
content-free record on success and failure with the resolved model when known,
usage, duration, target digest, disposition or a safe failure code. Evidence
storage remains application-owned. If a configured sink fails, the assessment
rejects rather than returning an unaudited decision.
