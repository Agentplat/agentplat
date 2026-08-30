import {
  GovernedMissionMorphogenesisReconfigurationPortV2,
  type GovernedMissionMorphogenesisPortV2,
  type GovernedMissionMorphogenesisResultV2,
} from "@agentplat/collective-runtime/mission-lifecycle";
import {
  InteropMorphogenesisHandlerV2,
  type InteropMorphogenesisExecutionPortV2,
  type InteropMorphogenesisRequestV2,
} from "@agentplat/interop/morphogenesis";

void GovernedMissionMorphogenesisReconfigurationPortV2;
void InteropMorphogenesisHandlerV2;
declare const missionPort: GovernedMissionMorphogenesisPortV2;
declare const missionResult: GovernedMissionMorphogenesisResultV2;
declare const interopPort: InteropMorphogenesisExecutionPortV2;
declare const interopRequest: InteropMorphogenesisRequestV2;
void missionPort;
void missionResult;
void interopPort;
void interopRequest;
