export type PortableAgentErrorCodeV1 =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STATE_CONFLICT"
  | "STATE_INVALID"
  | "SESSION_ACTIVE"
  | "SESSION_NOT_ACTIVE"
  | "ADAPTER_INCOMPATIBLE"
  | "CONTROL_DENIED";

export class PortableAgentErrorV1 extends Error {
  readonly code: PortableAgentErrorCodeV1;

  constructor(code: PortableAgentErrorCodeV1, message: string) {
    super(message);
    this.name = "PortableAgentErrorV1";
    this.code = code;
  }
}
