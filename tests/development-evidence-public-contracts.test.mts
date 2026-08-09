import {
  DEVELOPMENT_CAPABILITY_IDS_V1,
  WebCryptoDevelopmentEvidenceAttestationVerifierV1,
  assessDevelopmentCapabilitiesV1,
  createDevelopmentCapabilityManifestV1,
  createDevelopmentCapabilityReceiptV1,
  createDevelopmentEvidencePolicyV1,
  createDevelopmentSourceTreeSnapshotV1,
  digestDevelopmentEvidenceArtifactV1,
  createUnsignedDevelopmentCapabilityAttestationV1,
  issueDevelopmentCapabilityAttestationV1,
  validateDevelopmentCapabilityManifestV1,
  validateDevelopmentCapabilityReceiptV1,
  validateDevelopmentEvidencePolicyV1,
  validateDevelopmentSourceTreeSnapshotV1,
  validateSignedDevelopmentCapabilityAttestationV1,
  type DevelopmentCapabilityAssessmentV1,
  type DevelopmentCapabilityAttestationProofV1,
  type DevelopmentCapabilityIdV1,
  type DevelopmentCapabilityManifestV1,
  type DevelopmentCapabilityReceiptV1,
  type DevelopmentEvidenceAttestationSignerV1,
  type DevelopmentEvidenceAttestationVerifierV1,
  type DevelopmentEvidenceArtifactResolverV1,
  type DevelopmentEvidenceAuthorizationV1,
  type DevelopmentEvidenceIssuerV1,
  type DevelopmentEvidencePolicyV1,
  type DevelopmentEvidencePublicKeyResolverV1,
  type DevelopmentEvidenceResolverV1,
  type DevelopmentSourceTreeEntryV1,
  type DevelopmentSourceTreeSnapshotV1,
  type SignedDevelopmentCapabilityAttestationV1,
  type UnsignedDevelopmentCapabilityAttestationV1,
} from "@agentplat/collective-planning/development-evidence";

void DEVELOPMENT_CAPABILITY_IDS_V1;
void WebCryptoDevelopmentEvidenceAttestationVerifierV1;
void assessDevelopmentCapabilitiesV1;
void createDevelopmentCapabilityManifestV1;
void createDevelopmentCapabilityReceiptV1;
void createDevelopmentEvidencePolicyV1;
void createDevelopmentSourceTreeSnapshotV1;
void digestDevelopmentEvidenceArtifactV1;
void createUnsignedDevelopmentCapabilityAttestationV1;
void issueDevelopmentCapabilityAttestationV1;
void validateDevelopmentCapabilityManifestV1;
void validateDevelopmentCapabilityReceiptV1;
void validateDevelopmentEvidencePolicyV1;
void validateDevelopmentSourceTreeSnapshotV1;
void validateSignedDevelopmentCapabilityAttestationV1;

type PublicContracts =
  | DevelopmentCapabilityAssessmentV1
  | DevelopmentCapabilityAttestationProofV1
  | DevelopmentCapabilityIdV1
  | DevelopmentCapabilityManifestV1
  | DevelopmentCapabilityReceiptV1
  | DevelopmentEvidenceAttestationSignerV1
  | DevelopmentEvidenceAttestationVerifierV1
  | DevelopmentEvidenceArtifactResolverV1
  | DevelopmentEvidenceAuthorizationV1
  | DevelopmentEvidenceIssuerV1
  | DevelopmentEvidencePolicyV1
  | DevelopmentEvidencePublicKeyResolverV1
  | DevelopmentEvidenceResolverV1
  | DevelopmentSourceTreeEntryV1
  | DevelopmentSourceTreeSnapshotV1
  | SignedDevelopmentCapabilityAttestationV1
  | UnsignedDevelopmentCapabilityAttestationV1;

declare const contracts: PublicContracts;
void contracts;
