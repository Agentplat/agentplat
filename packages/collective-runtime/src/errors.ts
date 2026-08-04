export type CollectiveRuntimeErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'STATE_INVALID'
  | 'EXECUTION_ACTIVE';

export class CollectiveRuntimeError extends Error {
  readonly code: CollectiveRuntimeErrorCode;

  constructor(code: CollectiveRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'CollectiveRuntimeError';
    this.code = code;
  }
}
