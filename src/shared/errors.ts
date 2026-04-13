export type ErrorCode =
  | "ACTOR_NOT_FOUND"
  | "CREDENTIALS_MISSING"
  | "ERR_UNKNOWN"
  | "FFMPEG_ERROR"
  | "FFMPEG_NOT_FOUND"
  | "FORMAT_UNSUPPORTED"
  | "INVALID_ARGUMENT"
  | "MISSING_INPUT"
  | "MISSING_OUTPUT"
  | "PROVIDER_REQUEST_FAILED"
  | "PROVIDER_UNSUPPORTED"
  | "REGISTRY_NOT_FOUND"
  | "REGISTRY_PARSE_ERROR"
  | "SCRIPT_PARSE_ERROR"
  | "SETUP_FAILED";

export class CliError extends Error {
  readonly exitCode: number;
  readonly code: ErrorCode;

  constructor(message: string, exitCode = 1, options?: ErrorOptions & { code?: ErrorCode }) {
    super(message, options);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.code = options?.code ?? "ERR_UNKNOWN";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new CliError(message);
  }
}
