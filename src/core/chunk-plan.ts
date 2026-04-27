import { CliError } from "../shared/errors.js";
import type { ChunkContext } from "../providers/types.js";
import type { ChunkingPolicy } from "./chunk-policy.js";
import { splitText } from "./chunk.js";

export const MAX_CHUNK_COUNT = 1000;

export interface PlannedChunk {
  text: string;
  context: ChunkContext;
}

export function planChunks(text: string, policy: ChunkingPolicy): PlannedChunk[] {
  const pieces = splitText(text, policy.softTarget);
  if (pieces.length === 0) return [];

  if (pieces.length > MAX_CHUNK_COUNT) {
    throw new CliError(
      `Chunk plan would issue ${pieces.length} provider calls (cap ${MAX_CHUNK_COUNT}). ` +
        `Increase --max-chunk-chars or shorten the input.`,
      1,
      { code: "CHUNK_LIMIT_EXCEEDED" },
    );
  }

  for (const piece of pieces) {
    if (piece.length > policy.hardLimit) {
      throw new CliError(
        `A chunk of ${piece.length} chars exceeds the provider hard limit of ${policy.hardLimit}. ` +
          `An atomic protected region (bracket/paren tag) likely forced extension past the soft target.`,
        1,
        { code: "CHUNK_LIMIT_EXCEEDED" },
      );
    }
  }

  return pieces.map((piece, index) => {
    const context: ChunkContext = {
      index,
      total: pieces.length,
    };
    if (policy.supportsContext) {
      if (index > 0) context.previousText = pieces[index - 1];
      if (index < pieces.length - 1) context.nextText = pieces[index + 1];
    }
    return { text: piece, context };
  });
}
