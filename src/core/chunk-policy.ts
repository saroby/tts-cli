import { CliError } from "../shared/errors.js";
import type { ProviderCapabilities } from "../providers/types.js";
import type { ResolvedActor } from "../domain/actor/types.js";

export interface ChunkOverrides {
  maxChunkChars?: number;
  crossfadeMs?: number;
  chunkConcurrency?: number;
}

export function mergeChunkOverrides(
  actor: ResolvedActor,
  overrides: ChunkOverrides | undefined,
): ChunkOverrides {
  const synthesis = actor.synthesis;
  return {
    maxChunkChars: overrides?.maxChunkChars ?? synthesis?.maxChunkChars,
    crossfadeMs: overrides?.crossfadeMs ?? synthesis?.crossfadeMs,
    chunkConcurrency: overrides?.chunkConcurrency ?? synthesis?.chunkConcurrency,
  };
}

export interface ChunkingPolicy {
  hardLimit: number;
  softTarget: number;
  crossfadeMs: number;
  concurrency: number;
  supportsContext: boolean;
}

export const DEFAULT_CROSSFADE_MS = 50;
export const MAX_CROSSFADE_MS = 200;
export const DEFAULT_CHUNK_CONCURRENCY = 1;

export interface PolicyResolutionInput {
  text: string;
  format: string;
  capabilities: ProviderCapabilities | undefined;
  overrides?: ChunkOverrides;
}

export function resolveChunkingPolicy(input: PolicyResolutionInput): ChunkingPolicy | null {
  const { text, format, capabilities, overrides = {} } = input;
  const limit = capabilities?.textLimit;

  if (!limit) {
    return null;
  }

  const hardLimit = limit.hardMaxChars;
  const requestedSoft = overrides.maxChunkChars ?? limit.defaultSoftTarget ?? hardLimit;

  if (!Number.isInteger(requestedSoft) || requestedSoft <= 0) {
    throw new CliError(
      `max_chunk_chars must be a positive integer, got ${requestedSoft}.`,
      1,
      { code: "INVALID_ARGUMENT" },
    );
  }

  if (requestedSoft > hardLimit) {
    throw new CliError(
      `max_chunk_chars ${requestedSoft} exceeds provider hard limit ${hardLimit}.`,
      1,
      { code: "CHUNK_LIMIT_EXCEEDED" },
    );
  }

  if (text.length <= requestedSoft) {
    return null;
  }

  const chunkable = capabilities.chunkableFormats;
  if (chunkable && !chunkable.has(format)) {
    const supported = [...chunkable].sort().join(", ");
    throw new CliError(
      `Format "${format}" cannot be chunked. Use one of: ${supported}.`,
      1,
      { code: "CHUNK_FORMAT_UNSUPPORTED" },
    );
  }

  const crossfadeMs = validateCrossfade(overrides.crossfadeMs ?? DEFAULT_CROSSFADE_MS);
  const concurrency = validateConcurrency(overrides.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY);

  return {
    hardLimit,
    softTarget: requestedSoft,
    crossfadeMs,
    concurrency,
    supportsContext: capabilities.context?.previousNextText === true,
  };
}

function validateCrossfade(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new CliError(`crossfade_ms must be >= 0, got ${value}.`, 1, { code: "INVALID_ARGUMENT" });
  }
  if (value > MAX_CROSSFADE_MS) {
    throw new CliError(
      `crossfade_ms ${value} exceeds maximum ${MAX_CROSSFADE_MS}.`,
      1,
      { code: "INVALID_ARGUMENT" },
    );
  }
  return Math.round(value);
}

function validateConcurrency(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new CliError(
      `chunk_concurrency must be a positive integer, got ${value}.`,
      1,
      { code: "INVALID_ARGUMENT" },
    );
  }
  return value;
}
