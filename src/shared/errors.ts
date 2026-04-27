export type ErrorCode =
  | "ACTOR_NOT_FOUND"
  | "CHUNK_FORMAT_UNSUPPORTED"
  | "CHUNK_LIMIT_EXCEEDED"
  | "CREDENTIALS_MISSING"
  | "ERR_UNKNOWN"
  | "FFMPEG_ERROR"
  | "FFMPEG_JOIN_FAILED"
  | "FFMPEG_NOT_FOUND"
  | "FORMAT_UNSUPPORTED"
  | "INVALID_ARGUMENT"
  | "JOIN_FORMAT_UNSUPPORTED"
  | "MISSING_INPUT"
  | "MISSING_OUTPUT"
  | "PLAYBACK_FAILED"
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
