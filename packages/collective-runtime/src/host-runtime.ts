import type { VerifiedMeshEnvelope } from "@agentplat/mesh-protocol";
import type {
  JointWorkContractV1,
  TeamActivationRequestV1,
  TeamFormationDecisionV1,
  TeamFormationRequestV1,
} from "./team-formation-contracts.js";
import type {
  TeamExecutionPolicyRecordV1,
  TeamExecutionRecordV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
} from "./team-execution-contracts.js";
import type {
  TeamExecutionContinuityCheckpointRequestV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityTakeoverRequestV1,
  TeamExecutionContinuityTakeoverResultV1,
} from "./team-execution-continuity-contracts.js";
import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureAdaptationRequestV1,
  TeamStructureAdaptationStateV1,
  TeamStructureFormationAdapterInputV1,
  TeamStructureMaterializationV1,
  TeamStructureObservationV1,
  TeamStructurePositionBindingV1,
} from "./team-structure-adaptation-contracts.js";
import {
  createTeamFormationRequestFromTeamStructureV1,
  createTeamStructureMaterializationV1,
  createTeamStructureObservationFromExecutionStateV1,
} from "./team-structure-adaptation-adapters.js";
import type {
  CollectivePeerHostDrainOutcomeV1,
  CollectivePeerHostFacadeV1,
  CollectivePeerHostLimitsV1,
  CollectivePeerHostOptionsV1,
  CollectivePeerHostReceiveInputV1,
  CollectivePeerHostReceiveOutcomeV1,
  CollectivePeerHostRoutePortV1,
  CollectivePeerHostRouteV1,
  CollectivePeerHostStatusV1,
  CollectivePeerHostTopologyFreshnessV1,
} from "./host-contracts.js";
import { routeCollectivePeerEnvelopeV1 } from "./host-routing.js";
import {
  assertAdmissionClaimV1,
  assertDispatchOutcomeV1,
  assertDurableAdmissionV1,
  assertHostIdentifierV1,
  assertHostRoutePortV1,
  assertVerifiedEnvelopeShapeV1,
  digestVerifiedMeshEnvelopeIdentityV1,
  normalizeHostLimitsV1,
} from "./host-validation.js";

type Lifecycle = CollectivePeerHostStatusV1["lifecycle"];

/**
 * Transport-neutral peer host. A shared durable claim binds each message to a
 * route before route-owned admission. Every subsystem keeps its own CAS and
 * authority checks; this host only schedules and composes their typed ports.
 */
export class CollectivePeerHostRuntimeV1 implements CollectivePeerHostFacadeV1 {
  readonly #options: CollectivePeerHostOptionsV1;
  readonly #routes: readonly CollectivePeerHostRoutePortV1[];
  readonly #limits: CollectivePeerHostLimitsV1;
  readonly #knownCriticalExtensions: ReadonlySet<string>;
  readonly #inFlightRoutes = new Set<string>();
  #selectionTail: Promise<void> = Promise.resolve();
  #lifecycle: Lifecycle = "new";
  #nextRoute = 0;
  #activeDispatches = 0;
  #loopActive = false;

  constructor(options: CollectivePeerHostOptionsV1) {
    if (!options || typeof options !== "object")
      throw new TypeError("peer host options are required");
    assertHostIdentifierV1(options.hostId, "host.hostId");
    if (!Array.isArray(options.routes) || options.routes.length === 0)
      throw new TypeError("at least one peer host route is required");
    options.routes.forEach(assertHostRoutePortV1);
    const routeIds = new Set<string>();
    const exchangeExtensions = new Set<string>();
    for (const route of options.routes) {
      if (routeIds.has(route.route.routeId))
        throw new TypeError("duplicate peer host route");
      routeIds.add(route.route.routeId);
      if (route.route.kind === "exchange") {
        const extension = route.route.criticalExtension!;
        if (exchangeExtensions.has(extension))
          throw new TypeError("duplicate peer host critical extension route");
        exchangeExtensions.add(extension);
      }
    }
    if (
      !options.claims ||
      typeof options.claims.claim !== "function" ||
      typeof options.claims.complete !== "function"
    )
      throw new TypeError("shared peer host claim port is required");
    if (!options.topology || typeof options.topology.freshness !== "function")
      throw new TypeError("peer host topology port is required");
    if (!options.clock || typeof options.clock.now !== "function")
      throw new TypeError("peer host clock port is required");
    if (options.verifier && typeof options.verifier.verify !== "function")
      throw new TypeError("peer host verifier is invalid");
    if (
      options.formation &&
      (typeof options.formation.form !== "function" ||
        typeof options.formation.activate !== "function")
    )
      throw new TypeError("peer host formation port is invalid");
    if (
      options.execution &&
      (typeof options.execution.start !== "function" ||
        typeof options.execution.runStep !== "function")
    )
      throw new TypeError("peer host execution port is invalid");
    if (
      options.continuity &&
      (typeof options.continuity.checkpoint !== "function" ||
        typeof options.continuity.takeover !== "function" ||
        typeof options.continuity.start !== "function" ||
        typeof options.continuity.runStep !== "function")
    )
      throw new TypeError("peer host continuity port is invalid");
    if (
      options.structure &&
      (!options.structure.adaptation ||
        typeof options.structure.adaptation.observe !== "function" ||
        typeof options.structure.adaptation.recommend !== "function" ||
        !options.structure.catalog)
    )
      throw new TypeError("peer host structure adaptation ports are invalid");
    if (
      options.structure &&
      options.structure.adaptation.catalogDigest !==
        options.structure.catalog.catalogDigest
    )
      throw new TypeError(
        "peer host structure adaptation catalog binding is invalid",
      );

    const known = options.knownCriticalExtensions ?? [...exchangeExtensions];
    if (new Set(known).size !== known.length)
      throw new TypeError("known critical extensions must be unique");
    for (const extension of known) {
      if (!exchangeExtensions.has(extension))
        throw new TypeError("known critical extension has no exchange route");
    }
    this.#options = options;
    this.#routes = Object.freeze([...options.routes]);
    this.#limits = normalizeHostLimitsV1(options.limits);
    this.#knownCriticalExtensions = new Set(known);
  }

  async restore(): Promise<CollectivePeerHostStatusV1> {
    if (this.#lifecycle === "new") this.#lifecycle = "restored";
    return this.status();
  }

  /** Runs until aborted or `stop()` is called. */
  async start(input: {
    readonly signal: AbortSignal;
    readonly idleDelayMs?: number;
  }): Promise<void> {
    if (!input?.signal)
      throw new TypeError("a host lifecycle signal is required");
    const idleDelayMs = boundedDelay(input.idleDelayMs ?? 100);
    if (this.#loopActive)
      throw new Error("peer host lifecycle loop is already running");
    if (this.#lifecycle === "new") await this.restore();
    if (this.#lifecycle === "stopped")
      throw new Error("peer host cannot restart after stop");
    this.#lifecycle = "running";
    this.#loopActive = true;
    try {
      while (!input.signal.aborted && !this.#stopped()) {
        const cycle = await this.runOnce({ signal: input.signal });
        if (input.signal.aborted || this.#stopped()) break;
        if (cycle.dispatched === 0)
          await abortableDelay(idleDelayMs, input.signal);
      }
    } finally {
      this.#loopActive = false;
      if (input.signal.aborted && !this.#stopped()) this.#lifecycle = "stopped";
    }
  }

  async stop(): Promise<CollectivePeerHostStatusV1> {
    this.#lifecycle = "stopped";
    return this.status();
  }

  async form(
    request: TeamFormationRequestV1,
  ): Promise<TeamFormationDecisionV1> {
    if (!this.#options.formation) throw new Error("formation_port_unavailable");
    return this.#options.formation.form(request);
  }

  async activate(
    request: TeamActivationRequestV1,
  ): Promise<JointWorkContractV1> {
    if (!this.#options.formation) throw new Error("formation_port_unavailable");
    return this.#options.formation.activate(request);
  }

  async execute(
    request: TeamExecutionStartRequestV1,
  ): Promise<TeamExecutionRecordV1> {
    if (this.#options.continuity)
      return this.#options.continuity.start(request);
    if (!this.#options.execution) throw new Error("execution_port_unavailable");
    return this.#options.execution.start(request);
  }

  async dispatch(input: {
    readonly command: TeamExecutionStepCommandV1;
    readonly signal?: AbortSignal;
  }): Promise<TeamExecutionRecordV1> {
    if (this.#options.continuity)
      return this.#options.continuity.runStep(input);
    if (!this.#options.execution) throw new Error("execution_port_unavailable");
    return this.#options.execution.runStep(input);
  }

  async checkpoint(
    request: TeamExecutionContinuityCheckpointRequestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1> {
    if (!this.#options.continuity)
      throw new Error("continuity_port_unavailable");
    return this.#options.continuity.checkpoint(request);
  }

  async recover(
    request: TeamExecutionContinuityTakeoverRequestV1,
  ): Promise<TeamExecutionContinuityTakeoverResultV1> {
    if (!this.#options.continuity)
      throw new Error("continuity_port_unavailable");
    return this.#options.continuity.takeover(request);
  }

  async observe(
    observation: TeamStructureObservationV1,
  ): Promise<TeamStructureAdaptationStateV1> {
    if (!this.#options.structure) throw new Error("structure_port_unavailable");
    return this.#options.structure.adaptation.observe(observation);
  }

  async observeExecution(input: {
    readonly observationId: string;
    readonly executionState: TeamExecutionStateV1;
    readonly executionPolicy: TeamExecutionPolicyRecordV1;
    readonly decision: TeamStructureAdaptationDecisionV1;
    readonly materialization: TeamStructureMaterializationV1;
    readonly observedAtLogicalMs: number;
  }): Promise<TeamStructureAdaptationStateV1> {
    if (!this.#options.structure) throw new Error("structure_port_unavailable");
    const observation = createTeamStructureObservationFromExecutionStateV1({
      ...input,
      catalog: this.#options.structure.catalog,
    });
    return this.#options.structure.adaptation.observe(observation);
  }

  async select(
    request: TeamStructureAdaptationRequestV1,
  ): Promise<TeamStructureAdaptationDecisionV1> {
    if (!this.#options.structure) throw new Error("structure_port_unavailable");
    return this.#options.structure.adaptation.recommend(request);
  }

  materialize(input: {
    readonly templateId: string;
    readonly bindings: readonly TeamStructurePositionBindingV1[];
  }): TeamStructureMaterializationV1 {
    if (!this.#options.structure) throw new Error("structure_port_unavailable");
    return createTeamStructureMaterializationV1({
      ...input,
      catalog: this.#options.structure.catalog,
    });
  }

  async formFromStructure(
    input: Omit<TeamStructureFormationAdapterInputV1, "catalog">,
  ): Promise<TeamFormationDecisionV1> {
    if (!this.#options.structure) throw new Error("structure_port_unavailable");
    if (!this.#options.formation) throw new Error("formation_port_unavailable");
    if (typeof this.#options.formation.loadState !== "function")
      throw new Error("formation_state_port_unavailable");
    const formationState = await this.#options.formation.loadState();
    if (formationState.team !== null)
      throw new Error("team_structure_formation_requires_fresh_runtime");
    const request = createTeamFormationRequestFromTeamStructureV1({
      ...input,
      catalog: this.#options.structure.catalog,
    });
    return this.#options.formation.form(request);
  }

  async receive(
    input: CollectivePeerHostReceiveInputV1,
  ): Promise<CollectivePeerHostReceiveOutcomeV1> {
    const envelope = await this.#verifiedEnvelope(input);
    if (!envelope)
      return { status: "rejected", reasonCode: "verification_failed" };
    let route: CollectivePeerHostRouteV1;
    try {
      route = routeCollectivePeerEnvelopeV1({
        envelope,
        routes: this.#routes,
        knownCriticalExtensions: this.#knownCriticalExtensions,
      });
    } catch (error) {
      return {
        status: "rejected",
        reasonCode: reason(error, "route_rejected"),
      };
    }

    const target = this.#route(route.routeId);
    const envelopeIdentityDigest =
      digestVerifiedMeshEnvelopeIdentityV1(envelope);
    let claimOutcome;
    try {
      claimOutcome = await this.#options.claims.claim({
        messageId: envelope.messageId,
        routeId: route.routeId,
        envelopeIdentityDigest,
        claimedAt: input.receivedAt ?? this.#now(),
      });
      if (typeof claimOutcome?.acquired !== "boolean")
        throw new TypeError("host admission claim outcome is invalid");
      assertAdmissionClaimV1(claimOutcome.claim);
    } catch (error) {
      return { status: "rejected", reasonCode: reason(error, "claim_failed") };
    }
    if (
      claimOutcome.claim.messageId !== envelope.messageId ||
      claimOutcome.claim.routeId !== route.routeId ||
      claimOutcome.claim.envelopeIdentityDigest !== envelopeIdentityDigest
    )
      return { status: "rejected", reasonCode: "claim_route_conflict" };
    if (claimOutcome.claim.status === "admitted")
      return { status: "acknowledged", route, duplicate: true };

    try {
      if ((await this.#pending(target)) >= this.#limits.maximumPendingPerRoute)
        return { status: "backpressured", reasonCode: "route_backpressure" };
      const admission = assertDurableAdmissionV1(
        await target.admit({
          envelope,
          receivedAt: input.receivedAt ?? this.#now(),
        }),
      );
      if (admission.status === "rejected" || !admission.durable)
        return {
          status: "rejected",
          reasonCode: admission.reasonCode ?? "admission_not_durable",
        };
      const completed = assertAdmissionClaimV1(
        await this.#options.claims.complete({
          messageId: envelope.messageId,
          routeId: route.routeId,
          envelopeIdentityDigest,
          admittedAt: this.#now(),
        }),
      );
      if (
        completed.status !== "admitted" ||
        completed.messageId !== envelope.messageId ||
        completed.routeId !== route.routeId ||
        completed.envelopeIdentityDigest !== envelopeIdentityDigest
      )
        return { status: "rejected", reasonCode: "claim_completion_invalid" };
      return {
        status: "acknowledged",
        route,
        duplicate: !claimOutcome.acquired || admission.status === "duplicate",
      };
    } catch (error) {
      return {
        status: "rejected",
        reasonCode: reason(error, "admission_failed"),
      };
    }
  }

  async runOnce(
    input: { readonly signal?: AbortSignal } = {},
  ): Promise<CollectivePeerHostDrainOutcomeV1> {
    if (this.#lifecycle === "new") await this.restore();
    if (this.#lifecycle === "stopped" || input.signal?.aborted)
      return idleResult(true);
    if ((await this.#freshness()) !== "fresh") return idleResult(true);

    let inspected = 0;
    while (inspected < this.#routes.length) {
      const route = await this.#reserveRoute();
      if (!route) return idleResult(this.#activeDispatches > 0);
      inspected += 1;
      let pending: number;
      try {
        pending = await this.#pending(route);
      } catch {
        await this.#releaseRoute(route.route.routeId);
        return { attempted: 1, dispatched: 0, paused: false, failed: 1 };
      }
      if (pending === 0) {
        await this.#releaseRoute(route.route.routeId);
        continue;
      }
      try {
        const outcome = assertDispatchOutcomeV1(await route.dispatch(input));
        return {
          attempted: 1,
          dispatched: outcome.status === "dispatched" ? 1 : 0,
          paused: outcome.status === "paused",
          failed: outcome.status === "failed" ? 1 : 0,
        };
      } catch {
        return { attempted: 1, dispatched: 0, paused: false, failed: 1 };
      } finally {
        await this.#releaseRoute(route.route.routeId);
      }
    }
    return idleResult(false);
  }

  async drain(
    input: {
      readonly maximumSteps?: number;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<CollectivePeerHostDrainOutcomeV1> {
    if (this.#lifecycle === "stopped") return idleResult(true);
    if (this.#lifecycle === "new") await this.restore();
    const maximumSteps = input.maximumSteps ?? this.#limits.maximumDrainSteps;
    if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1)
      throw new TypeError("drain.maximumSteps must be a positive safe integer");
    this.#lifecycle = "draining";
    let result: CollectivePeerHostDrainOutcomeV1 = idleResult(false);
    for (let index = 0; index < maximumSteps; index += 1) {
      if (this.#stopped() || input.signal?.aborted) {
        result = { ...result, paused: true };
        break;
      }
      const step = await this.runOnce({ signal: input.signal });
      result = {
        attempted: result.attempted + step.attempted,
        dispatched: result.dispatched + step.dispatched,
        paused: result.paused || step.paused,
        failed: result.failed + step.failed,
      };
      if (step.attempted === 0 || step.paused) break;
    }
    if (this.#lifecycle === "draining") this.#lifecycle = "running";
    return result;
  }

  async status(): Promise<CollectivePeerHostStatusV1> {
    return Object.freeze({
      schemaVersion: 1,
      lifecycle: this.#lifecycle,
      topology: await this.#freshness(),
      activeDispatches: this.#activeDispatches,
      nextRouteId: this.#routes[this.#nextRoute]?.route.routeId ?? null,
    });
  }

  async #verifiedEnvelope(
    input: CollectivePeerHostReceiveInputV1,
  ): Promise<VerifiedMeshEnvelope | null> {
    if (!input || typeof input !== "object") return null;
    try {
      if ("envelope" in input)
        return assertVerifiedEnvelopeShapeV1(input.envelope);
      if (!("unverifiedEnvelope" in input) || !this.#options.verifier)
        return null;
      const verified = await this.#options.verifier.verify(
        input.unverifiedEnvelope,
      );
      return verified ? assertVerifiedEnvelopeShapeV1(verified) : null;
    } catch {
      return null;
    }
  }

  /** Reserves a route and a global slot under one short serialized section. */
  async #reserveRoute(): Promise<CollectivePeerHostRoutePortV1 | undefined> {
    return this.#withSelection(() => {
      if (this.#activeDispatches >= this.#limits.maximumConcurrentDispatches)
        return undefined;
      for (let offset = 0; offset < this.#routes.length; offset += 1) {
        const index = (this.#nextRoute + offset) % this.#routes.length;
        const route = this.#routes[index]!;
        if (this.#inFlightRoutes.has(route.route.routeId)) continue;
        this.#inFlightRoutes.add(route.route.routeId);
        this.#activeDispatches += 1;
        this.#nextRoute = (index + 1) % this.#routes.length;
        return route;
      }
      return undefined;
    });
  }

  async #releaseRoute(routeId: string): Promise<void> {
    await this.#withSelection(() => {
      if (!this.#inFlightRoutes.delete(routeId))
        throw new Error("peer host route slot was not reserved");
      this.#activeDispatches -= 1;
    });
  }

  async #withSelection<T>(operation: () => T): Promise<T> {
    const previous = this.#selectionTail;
    let release!: () => void;
    this.#selectionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return operation();
    } finally {
      release();
    }
  }

  #route(routeId: string): CollectivePeerHostRoutePortV1 {
    const route = this.#routes.find(
      (candidate) => candidate.route.routeId === routeId,
    );
    if (!route) throw new Error("host route disappeared");
    return route;
  }

  async #freshness(): Promise<CollectivePeerHostTopologyFreshnessV1> {
    try {
      const freshness = await this.#options.topology.freshness();
      return freshness === "fresh" ||
        freshness === "stale" ||
        freshness === "unknown"
        ? freshness
        : "unknown";
    } catch {
      return "unknown";
    }
  }

  async #pending(route: CollectivePeerHostRoutePortV1): Promise<number> {
    const pending = await route.pending();
    if (!Number.isSafeInteger(pending) || pending < 0)
      throw new TypeError("host route returned an invalid pending count");
    return pending;
  }

  #now(): string {
    const value = this.#options.clock.now();
    if (typeof value !== "string" || !value)
      throw new TypeError("host clock returned an invalid time");
    return value;
  }

  #stopped(): boolean {
    return this.#lifecycle === "stopped";
  }
}

function idleResult(paused: boolean): CollectivePeerHostDrainOutcomeV1 {
  return { attempted: 0, dispatched: 0, paused, failed: 0 };
}

function boundedDelay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000)
    throw new TypeError(
      "idleDelayMs must be a safe integer between zero and 60000",
    );
  return value;
}

function abortableDelay(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, durationMs);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
