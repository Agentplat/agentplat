import {
  BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
  BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1,
  checkBoundedCollectiveControlModelV1,
  createBoundedCollectiveControlBoundsV1,
  type BoundedCollectiveControlCheckResultV1,
  type BoundedCollectiveControlPropertyV1,
  type BoundedCollectiveControlTransitionV1,
} from "@agentplat/collective-control/bounded-model";
import {
  BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1,
  checkBoundedCollectiveProgressModelV1,
  createBoundedCollectiveProgressBoundsV1,
  type BoundedCollectiveProgressCheckResultV1,
  type BoundedCollectiveProgressPropertyV1,
  type BoundedCollectiveProgressTransitionV1,
} from "@agentplat/collective-control/bounded-progress-model";

const bounds = createBoundedCollectiveControlBoundsV1();
const result: BoundedCollectiveControlCheckResultV1 =
  checkBoundedCollectiveControlModelV1({ bounds });
const property: BoundedCollectiveControlPropertyV1 =
  BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1[0];
const exploredStateSetDigest: `sha256:${string}` =
  result.exploredStateSetDigest;
const effectAuthorizationWitnesses =
  result.status === "proved_within_bounds"
    ? result.effectAuthorizationCoverage.compoundAllocationTupleWitnesses
    : null;
const transition: BoundedCollectiveControlTransitionV1 = {
  implementationDigest: `sha256:${"a".repeat(64)}`,
  apply({ state, command }) {
    void command;
    return { status: "rejected", reasonCode: "example", state };
  },
};

void BOUNDED_COLLECTIVE_CONTROL_MODEL_ID;
void result;
void property;
void exploredStateSetDigest;
void effectAuthorizationWitnesses;
void transition;

// @ts-expect-error property identifiers are a closed union.
const invalidProperty: BoundedCollectiveControlPropertyV1 = "deployment_safe";
void invalidProperty;

// @ts-expect-error custom transition identity is required.
const unidentifiedTransition: BoundedCollectiveControlTransitionV1 = {
  apply: ({ state }) => ({ status: "rejected", reasonCode: "example", state }),
};
void unidentifiedTransition;

const progressBounds = createBoundedCollectiveProgressBoundsV1();
const progressResult: BoundedCollectiveProgressCheckResultV1 =
  checkBoundedCollectiveProgressModelV1({ bounds: progressBounds });
const progressProperty: BoundedCollectiveProgressPropertyV1 =
  BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1[0];
const progressTransition: BoundedCollectiveProgressTransitionV1 = {
  implementationDigest: `sha256:${"b".repeat(64)}`,
  apply({ state }) {
    return { status: "rejected", reasonCode: "example", state };
  },
};
const progressExploredStateSetDigest: `sha256:${string}` =
  progressResult.exploredStateSetDigest;

void progressProperty;
void progressTransition;
void progressExploredStateSetDigest;

// @ts-expect-error progress property identifiers are a closed union.
const invalidProgressProperty: BoundedCollectiveProgressPropertyV1 =
  "production_live";
void invalidProgressProperty;
