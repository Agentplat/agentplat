# `@agentplat/interop`

A small, provider-neutral protocol and SDK for connecting external agent
runtimes and simulation environments. It provides a versioned capability
handshake, content-bound request/response envelopes, idempotent sequences,
checkpoint and restore operations, cancellation, and a concrete HTTP transport.

The remote agent adapter implements Agentplat's portable agent interface. The
environment client exposes reset, partial observation, action, snapshot,
restore, and close without imposing a particular simulator framework.

Clients bind every request to a configured `clientId`; routers bind processing
to a distinct `routerInstanceId`. Negotiated manifest flags declare request and
response signatures; when enabled, the router verifies the request issuer and
the client verifies the endpoint before accepting either envelope. A
compare-and-set reservation is acquired before a
handler runs, so concurrent retries cannot both enter the operation. Durable
idempotency and sequence stores must preserve reservations, responses and the
per-emitter/session/operation high-water across replicas. Handlers that create
external effects must also use the request idempotency key at the effect
boundary.

Clients and routers capture their transport, schema, authenticity, admission,
handler, sequence and persistence methods at construction time. The manifest
and scalar limits are copied into an immutable snapshot. Replacing a public
method or mutating the caller's options object after construction therefore
cannot redirect an established protocol path.

Both clients and routers require an `InteropPayloadSchemaResolverV1`. The
resolver must return executable validators for the exact input and output
schema digests committed by the negotiated manifest; completed payloads are
validated before an adapter cast or handler response is accepted. Protocol
errors carry `null` rather than bypassing the negotiated output schema.
`InteropSimulationEnvironmentClientV1` and `InteropPortableAgentAdapterV1`
allocate envelope sequence numbers through `InteropOutboundSequenceStoreV1`.
A durable implementation must atomically preserve each issuer/session
high-water mark and the sequence allocated to each idempotency key, so exact
retries and process restarts reuse the same signed request body. This transport
sequence is independent from an agent's step or checkpoint sequence; in
particular, a checkpoint through step zero still uses a positive envelope
sequence. The portable adapter accepts the store as its second constructor
argument. Omitting it preserves the original one-argument constructor but uses
a new process-local `InMemoryInteropOutboundSequenceStoreV1`, which is only a
bounded development convenience. The in-memory resolver and outbound sequence
store are not cross-process custody.

`@agentplat/interop/webcrypto` supplies the concrete
`WebCryptoInteropAuthenticityPortV1` Ed25519 implementation. The same class is
configured with the local private key and an application-owned public-key
resolver for remote signer identities.

## Governed agent lifecycle

`@agentplat/interop/governed-lifecycle` composes endpoint negotiation with the
governed lineage and collective-membership lifecycle. A capability profile
binds the exact adapter, endpoint implementation, required operations,
manifest flags and operation-to-capability mapping. A role profile binds the
role-definition digest and required capability keys. Admission fails before
agent creation when the negotiated manifest or creation request falls outside
either profile.

`GovernedInteropLifecycleV1.createAndEnroll` writes a content-free prepared
session record through CAS, invokes `GovernedAgentLifecycleRuntimeV1` for the
certified create-and-enroll transition, verifies current lifecycle eligibility
and then activates the session. It returns an `InteropPortableAgentAdapterV1`
whose portable-agent methods re-check the active session record and
the lifecycle's library-owned eligibility invoker with the operation's
capability key immediately before each remote call.

Both `GovernedInteropLifecycleV1` and
`GovernedInteropRequestAdmissionV1` require a concrete, nominal
`GovernedAgentLifecycleRuntimeV1`. Structural lifecycle-shaped objects are not
authoritative. The governed path invokes create/enroll, eligibility and
retirement through module-owned closures, so replacing public instance methods
or overriding them in a subclass cannot bypass lifecycle state. The retained
`NonAuthoritativeInteropLifecyclePortV1` contract is only for explicitly
non-authoritative integration adapters.

Lifecycle and request-admission instances retain immutable construction-time
bindings for the client identity and negotiation method, lifecycle runtime,
session store, capability and role profiles, and cryptographic provider. Later
mutation of the caller's options object or rebinding the public `options` or
`store` properties cannot redirect an established governed session.
When an authoritative endpoint manifest is configured, the lifecycle validates
the complete manifest body and its digest before writing a prepared session or
invoking agent creation; digest strings alone are not treated as capabilities.

The authoritative reference path is
`createReferenceGovernedInteropRuntimeV1`. It creates the lifecycle runtime,
nominal request admission and endpoint router over one exact lifecycle, session
store and capability profile, and exposes library-owned closures for session
activation, retirement and request handling. This prevents a structurally
similar or subsequently patched admission, gate, client or router method from
becoming authoritative. `GovernedInteropRequestAdmissionV1` requires a
signed-request capability profile, the complete validated role profile and the
complete validated endpoint manifest. It binds the authenticated issuer, request,
operation capability, session-record digest/revision and membership epoch. The
router revalidates that exact grant after handler work, immediately before the
idempotency commit, and once more before returning a new or cached response. A
concurrent retirement therefore withholds the completed payload, and a caller
cannot bypass lifecycle checks by constructing a plain
`InteropPortableAgentAdapterV1` or invoking the transport directly.
Cached records are normalized and their envelope digest, endpoint binding,
signature, size and negotiated output schema are revalidated before delivery.
Reference-composition operation code is split into a side-effect-free
`preparer` and an effect commit port. After preparation, the runtime
revalidates the exact admission grant and passes its revision, epoch, scope
digest and binding digest as a fence to `effects.commit`. Commit ports must
atomically reject stale fences; effectful work does not belong in preparers.

```js
import {
  createReferenceGovernedInteropRuntimeV1,
  createRestartDurableGovernedInteropRuntimeStoresV1,
  createInteropCapabilityProfileV1,
  createInteropRoleProfileV1,
} from "@agentplat/interop/governed-lifecycle";
import { createRestartDurableInteropRouterStoresV1 } from "@agentplat/interop";

const governed = createReferenceGovernedInteropRuntimeV1({
  client,
  lifecycle,
  capabilityProfile: await createInteropCapabilityProfileV1(capabilityProfile),
  roleProfile: await createInteropRoleProfileV1(roleProfile),
  durableStores: createRestartDurableGovernedInteropRuntimeStoresV1({
    sessionStore: durableSessionStore,
    outboundSequences: durableOutboundSequenceStore,
    routerStores: createRestartDurableInteropRouterStoresV1({
      idempotency: durableIdempotencyStore,
      sequences: durableInboundSequenceStore,
    }),
  }),
  router: {
    routerInstanceId,
    manifest,
    preparers,
    effects: fencedEffectCommitPort,
    schemas,
    authenticity,
  },
});

const session = await governed.createAndEnroll(admission);
const response = await governed.handle(request, {
  logicalTimeMs,
  signal,
});
await session.adapter.step(step, adapterContext);
await governed.retire({
  sessionId: admission.sessionId,
  reasonCode: "operator_retirement",
  cascade: false,
  logicalTimeMs,
});
```

Retirement is idempotent: exact retries return the committed retirement record,
while concurrent callers converge through CAS and the lifecycle's idempotent
`retirePeer`. `InMemoryGovernedInteropSessionStoreV1` is process-local
development support. Replicated deployments must provide the exported durable
store port with atomic compare-and-set behavior. A prepared record whose
lifecycle creation stopped at an intermediate state requires operator or host
reconciliation before retry; interop does not invent membership authority to
repair a partial lifecycle transition.

For that durable path, `@agentplat/interop-postgres` provides PostgreSQL
implementations of `GovernedInteropSessionStoreV1`,
`InteropOutboundSequenceStoreV1`, `InteropIdempotencyStoreV1` and
`InteropSequenceStoreV1`. Operational reference runtimes must wrap all four in
the nominal closed composition shown above; partial durable custody fails
closed. Tests and single-process tools may instead select `localOnly: true` at
the top level, which explicitly creates all four process-local stores. The
lower-level lifecycle, clients and router retain their existing explicit/local
construction APIs.
