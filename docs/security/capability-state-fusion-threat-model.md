# Capability-State Fusion V1 threat model

## Protected assets

- exact tenant, Mesh, policy-domain, mission, Objective and Work scope;
- integrity and completeness of each bounded candidate set;
- current Trust, role, capacity, reachability and recovery restrictions;
- monotonic source revisions and trusted logical time;
- fail-closed use across every peer-node candidate path;
- confidentiality of model context, Trust evidence and credentials.

## Trust boundaries

The peer node trusts its configured fusion port identity and policy binding.
The fusion runtime trusts the configured signal-source implementations and the
atomicity of its state store. Signals are local projections, not remote
self-assertions; a deployment that converts remote records into signals must
authenticate and admit those records before the source returns them.

Discovery, allocation and recovery protocols remain responsible for their own
signed evidence and currentness. Fusion narrows their candidates and never
replaces those checks.

## Threats and controls

| Threat                           | Control                                                                                   | Failure behavior                        |
| -------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| Candidate injection              | Request digest covers the exact sorted candidate set; decisions must cover it exactly     | Reject malformed decision               |
| Cross-tenant or cross-Work reuse | Request binds complete scope and operation                                                | Reject binding mismatch                 |
| Capability inflation             | Candidate factory requires every required key in admitted advertised keys                 | Candidate is not constructed            |
| Missing Trust or role state      | Policy names required dimensions per operation                                            | Candidate becomes unavailable           |
| Expired or future signal         | Trusted logical-time checks and exclusive expiry                                          | Candidate becomes unavailable           |
| Source rollback                  | Durable per-source revision head                                                          | Candidate becomes unavailable           |
| Same-revision equivocation       | Revision plus signal digest comparison                                                    | Candidate becomes ineligible            |
| Restricted state promoted        | Node consumes only exact `eligible` dispositions                                          | Candidate is withheld                   |
| Fusion port exception            | Construction-bound call is caught at the node                                             | Empty eligible set                      |
| Decision tampering               | Canonical decision digest, binding validation and complete coverage                       | Empty eligible set                      |
| State rollback after restart     | CAS store plus state digest and external durable custody                                  | Restore rejected or old signal withheld |
| Global-state oracle              | Hard candidate/head bounds; input is the local sparse view                                | Oversized request rejected              |
| Raw evidence disclosure          | Content-free identifiers, statuses, reasons and digests only                              | Unknown fields rejected                 |
| Fusion creates authority         | Existing Work, mandate, lease, fence, confirmation and Action boundaries remain mandatory | No effect is dispatched                 |
| Capacity exhaustion              | Candidate, signal, reason, head and CAS-attempt ceilings                                  | Fail closed at the relevant boundary    |

## Safety properties

1. The runtime cannot return a decision for a candidate not present in the
   bound request.
2. One required negative dimension makes the candidate ineligible.
3. Missing, expired, future-dated or rolled-back required state cannot produce
   eligibility.
4. A fusion decision cannot create an assignment or external-effect authority.
5. Installing the port closes initial offer, reoffer, bid, award, acceptance,
   execution re-derivation and recovery candidate paths.
6. The runtime stores no prompt, output, action content, credential or hidden
   model reasoning.

## Residual risks and non-goals

- A compromised local source may emit a structurally valid but misleading
  signal. Independent sources, Trust policies and attestation remain deployment
  concerns.
- A compromised durable store may erase all state. An external rollback anchor
  is required when storage administrators are outside the trust boundary.
- Missing state or partitions can stop useful work; V1 chooses safety over
  forced availability.
- Eligibility is not factual truth, optimality or permission to cause an
  external effect.
- V1 does not aggregate raw sensor observations or expose a global world model.

## Required verification

- canonical candidate, request, signal, decision and snapshot tamper rejection;
- missing, restricted, ineligible, expired and future-dated signal cases;
- source-revision rollback and same-revision equivocation;
- CAS conflict retry and restart using retained state;
- malformed or throwing port yields no peer-node candidate;
- offer, bid, award, acceptance/execution and recovery integration coverage;
- frontier sparse-overlay view stays below local candidate limits; and
- public package, browser traversal, type, audit and packed-consumer checks.
