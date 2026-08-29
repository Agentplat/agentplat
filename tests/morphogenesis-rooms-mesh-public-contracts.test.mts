import {
  projectMorphogenesisDiffToRoomArtifactV1,
  projectMorphogenesisNeedToMeshV1,
  projectMorphogenesisReceiptToRoomArtifactV1,
  projectMorphogenesisStatusToRoomMessageV1,
  MorphogenesisRoomParticipationPortV1,
  MorphogenesisMeshPublisherV1,
  type MorphogenesisMeshNeedProjectionV1,
  type MorphogenesisRoomArtifactProjectionV1,
  type MorphogenesisRoomMessageProjectionV1,
  type MorphogenesisRoomParticipationReceiptV1,
  type MorphogenesisAuthenticatedMeshReceiptV1,
  type MorphogenesisAuthenticatedMeshTransportV1,
} from "@agentplat/rooms-mesh/morphogenesis";

void projectMorphogenesisDiffToRoomArtifactV1;
void projectMorphogenesisNeedToMeshV1;
void projectMorphogenesisReceiptToRoomArtifactV1;
void projectMorphogenesisStatusToRoomMessageV1;
void MorphogenesisRoomParticipationPortV1;
void MorphogenesisMeshPublisherV1;

declare const mesh: MorphogenesisMeshNeedProjectionV1;
declare const artifact: MorphogenesisRoomArtifactProjectionV1;
declare const message: MorphogenesisRoomMessageProjectionV1;
declare const participation: MorphogenesisRoomParticipationReceiptV1;
declare const meshReceipt: MorphogenesisAuthenticatedMeshReceiptV1;
declare const meshTransport: MorphogenesisAuthenticatedMeshTransportV1;
void mesh;
void artifact;
void message;
void participation;
void meshReceipt;
void meshTransport;
