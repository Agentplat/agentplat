export type CollectivePeerRuntimeErrorCodeV1 =
  | "VALIDATION_ERROR"
  | "STATE_CONFLICT"
  | "SESSION_BINDING_INVALID"
  | "AGENT_OUTPUT_INVALID";

export class CollectivePeerRuntimeErrorV1 extends Error {
  readonly code: CollectivePeerRuntimeErrorCodeV1;

  constructor(code: CollectivePeerRuntimeErrorCodeV1, message: string) {
    super(message);
    this.name = "CollectivePeerRuntimeErrorV1";
    this.code = code;
  }
}
