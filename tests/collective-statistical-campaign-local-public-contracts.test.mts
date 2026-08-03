import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_SCHEMA_VERSION_V1,
  DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1,
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
  type CollectiveStatisticalCampaignBundleVerifierV1,
  type CollectiveStatisticalCampaignCampaignLockV1,
  type CollectiveStatisticalCampaignLocalStoreLimitsV1,
  type CollectiveStatisticalCampaignLocalStoreV1,
  type CollectiveStatisticalCampaignMutationLockInspectionV1,
  type CollectiveStatisticalCampaignPublishedBundleV1,
  type CollectiveStatisticalCampaignSlotCommitResultV1,
  type CollectiveStatisticalCampaignStoredArtifactV1,
} from "@agentplat/mesh-sim-local";

const schema: typeof COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_SCHEMA_VERSION_V1 = 1;

void schema;
void DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1;
void createLocalCollectiveStatisticalCampaignExecutionStoreV1;
void openCollectiveStatisticalCampaignLocalStoreV1;
void (null as CollectiveStatisticalCampaignBundleVerifierV1 | null);
void (null as CollectiveStatisticalCampaignCampaignLockV1 | null);
void (null as CollectiveStatisticalCampaignLocalStoreLimitsV1 | null);
void (null as CollectiveStatisticalCampaignLocalStoreV1 | null);
void (null as CollectiveStatisticalCampaignMutationLockInspectionV1 | null);
void (null as CollectiveStatisticalCampaignPublishedBundleV1 | null);
void (null as CollectiveStatisticalCampaignSlotCommitResultV1 | null);
void (null as CollectiveStatisticalCampaignStoredArtifactV1 | null);

// @ts-expect-error the local store must be rooted at an explicit absolute path.
openCollectiveStatisticalCampaignLocalStoreV1({});
