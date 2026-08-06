# Long-Horizon Context Integrity V1 threat model

## Protected assets

- doctrine, mission, Objective and role instruction precedence;
- integrity of the exact context set delivered to an agent or model;
- longitudinal risk and recovery history;
- source, analyzer, policy and filter deployment bindings;
- credentials, prompts, outputs, action inputs and hidden reasoning;
- existing assignment, lease, fence, grant and effect authority boundaries.

## Trust boundaries

The controller trusts its installed policy, analyzer implementations, logical
clock and CAS store. Model and Portable Agent wrappers are trusted only through
their construction-bound filter digest. Remote peers, tools, retrieval,
providers and raw environment inputs are data sources, not instruction or
authority sources.

## Threats and controls

| Threat                                        | Control                                                        | Failure behavior           |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Instruction override in untrusted data        | Source-zone baseline plus analyzer conflict score              | Isolate or deny            |
| Quarantine claimed but not enforced           | Exact policy-allowed filter binding                            | Abstain or deny            |
| Context item injection/removal after analysis | Ordered request and decision digests cover every item          | Reject decision            |
| Cross-session decision replay                 | Request binds tenant, session, agent, Objective and checkpoint | Reject decision            |
| Conflicting observations                      | Claim-value and independent-group comparison                   | Require corroboration      |
| Fake corroboration                            | Sorted unique source and corroboration groups                  | Treat as insufficient      |
| Stale or future analysis                      | Trusted logical-time validity window                           | Isolate                    |
| Source/analyzer rollback                      | Durable revision heads                                         | Isolate                    |
| Same-revision equivocation                    | Digest comparison                                              | Deny                       |
| Healthy-step reset attack                     | Sticky degradation and recovery hysteresis                     | Remain degraded            |
| Restart or handoff laundering                 | CAS state plus source/target state-digest binding              | Reject or preserve history |
| State/resource exhaustion                     | Item, head, window, reason and step limits                     | Fail closed                |
| Raw-content retention                         | State accepts only digests and bounded metadata                | Unknown fields rejected    |
| Analyzer creates authority                    | Decision narrows data only; existing gateways remain mandatory | No external effect         |

## Safety properties

1. A withheld item is never delivered by an installed protected wrapper.
2. A controller without that wrapper cannot return an effective filtered allow.
3. Missing or invalid analysis cannot produce admission.
4. One negative required signal dominates positive signals.
5. A decision cannot add an item absent from the original request.
6. Restart and handoff cannot reduce retained high-water marks.
7. Controller state contains no original content or provider reasoning.

## Residual risks and non-goals

- A compromised analyzer may emit valid but misleading scores; independent
  analyzers and deployment attestation remain application concerns.
- Lexical rules are a transparent baseline, not a universal injection detector.
- Content digests do not prove factual truth.
- A compromised filter implementation can ignore its contract; deployment
  integrity must protect the bound implementation.
- The feature does not read hidden model reasoning or guarantee alignment.
- Side channels inside providers and external tools remain outside this state
  boundary.

## Required verification

- strict shape, digest, scope, coverage and tamper rejection;
- hostile instruction, contradiction, missing, expiry and future cases;
- source/analyzer rollback and equivocation;
- exact physical filtering in model and Portable Agent wrappers;
- CAS conflict, restart and checkpoint handoff;
- sticky degradation and bounded 10,000-step state;
- behavior parity when the feature is absent; and
- public browser, type, audit, release and packed-consumer verification.
