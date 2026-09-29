import {
  type AssessAgentInceptionV1,
  type InceptionAssessmentV1,
  type InceptionDispositionV1,
  AgentInceptionServiceV1,
  InMemoryAgentInceptionStoreV1,
} from "@agentplat/rooms";
import { PostgresAgentInceptionStoreV1 } from "@agentplat/rooms-postgres";
const dispositions: InceptionDispositionV1[] = [
  "adopted",
  "reformulated",
  "rejected",
  "needs_evidence",
  "deferred",
];
// @ts-expect-error adoption is not execution authority
const execution: InceptionAssessmentV1["executionAuthorized"] = true;
// @ts-expect-error no implicit execution disposition
const disposition: InceptionDispositionV1 = "execute";
const required: Pick<
  AssessAgentInceptionV1,
  "expectedGovernanceRevision" | "expectedAssessmentRevision"
> = { expectedGovernanceRevision: 0, expectedAssessmentRevision: -1 };
void dispositions;
void execution;
void disposition;
void required;
void AgentInceptionServiceV1;
void InMemoryAgentInceptionStoreV1;
void PostgresAgentInceptionStoreV1;
