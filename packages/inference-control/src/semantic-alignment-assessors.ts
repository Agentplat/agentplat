import {
  type SemanticAssessorPortV1,
  type SemanticControlRequestV1,
} from "./semantic-alignment-contracts.js";
import {
  createSemanticAssessorAssessmentV1,
  createSemanticAssessorDescriptorV1,
} from "./semantic-alignment-validation.js";

/**
 * Exact-digest exploration signal only. It intentionally makes no claims
 * about role, mission, context, intent, entailment, or meaning.
 */
export function createSemanticDigestExplorationHeuristicV1(input: {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly independenceGroup: string;
}): SemanticAssessorPortV1 {
  const descriptor = createSemanticAssessorDescriptorV1({
    schemaVersion: 1,
    ...input,
    basis: "reference_digest_heuristic",
    supportedDimensions: [
      "course_action_diversity",
      "course_action_novelty",
    ],
  });
  return Object.freeze({
    descriptor,
    assess(request: SemanticControlRequestV1) {
      const candidates = request.candidateCourseActionDigests;
      const unique = new Set(candidates);
      const diversity = candidates.length
        ? Math.floor((unique.size * 10_000) / candidates.length)
        : null;
      const history = new Set(request.priorCourseActionDigests);
      const selected = request.selectedCourseActionDigest;
      const novelty = selected === null ? null : history.has(selected) ? 0 : 10_000;
      const reasons: string[] = ["digest_only_exploration_signal"];
      if (diversity !== null && diversity < 10_000)
        reasons.push("duplicate_course_action_candidates");
      if (novelty === 0) reasons.push("course_action_digest_seen_before");
      return createSemanticAssessorAssessmentV1({
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        assessorId: descriptor.assessorId,
        assessorVersion: descriptor.assessorVersion,
        assessorImplementationDigest: descriptor.assessorImplementationDigest,
        independenceGroup: descriptor.independenceGroup,
        metrics: {
          roleCoherenceBps: null,
          missionAlignmentBps: null,
          contextConflictBps: null,
          uncertaintyBps: null,
          courseActionDiversityBps: diversity,
          courseActionNoveltyBps: novelty,
        },
        hardConstraintViolations: [],
        recommendation: "allow",
        reasonCodes: reasons.sort(),
        evidenceDigests: [],
      });
    },
  });
}
