import {
  MorphogenesisExecutionRuntimeV1,
  MorphogenesisSupersededCompensationPortV1,
  isMorphogenesisExecutionTerminalV1,
  type MorphogenesisExecutionRecordV1,
  type MorphogenesisSupersessionBindingV1,
  type MorphogenesisSupersessionReceiptV1,
} from '@agentplat/collective-runtime/morphogenesis';
import { projectMorphogenesisSupersessionToRoomArtifactV1 } from '@agentplat/rooms-mesh/morphogenesis';

declare const runtime: MorphogenesisExecutionRuntimeV1;
declare const record: MorphogenesisExecutionRecordV1;
const terminal: boolean = isMorphogenesisExecutionTerminalV1(record);
const binding: MorphogenesisSupersessionBindingV1 | undefined = record.supersession;
const receipt: MorphogenesisSupersessionReceiptV1 | undefined = record.supersessionReceipt;
const start: Promise<MorphogenesisExecutionRecordV1> = runtime.beginSupersededResolution({stateKey:'execution:test',logicalTimeMs:1});
const advance: Promise<MorphogenesisExecutionRecordV1> = runtime.advanceSupersededResolution({stateKey:'execution:test',logicalTimeMs:2});
const compensation = new MorphogenesisSupersededCompensationPortV1(runtime);
void [terminal,binding,receipt,start,advance,compensation,projectMorphogenesisSupersessionToRoomArtifactV1];
