import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHUNK_CONCURRENCY,
  DEFAULT_CROSSFADE_MS,
  resolveChunkingPolicy,
} from "../src/core/chunk-policy.js";
import { MAX_CHUNK_COUNT, planChunks } from "../src/core/chunk-plan.js";

const elevenLabsCaps = {
  textLimit: { hardMaxChars: 5000, defaultSoftTarget: 2500 },
  context: { previousNextText: true as const },
  chunkableFormats: new Set(["mp3"]),
};

const openAiCaps = {
  textLimit: { hardMaxChars: 4096, defaultSoftTarget: 2000 },
  chunkableFormats: new Set(["mp3", "wav"]),
};

describe("resolveChunkingPolicy", () => {
  it("returns null when provider has no textLimit", () => {
    expect(
      resolveChunkingPolicy({ text: "x".repeat(10_000), format: "mp3", capabilities: undefined }),
    ).toBeNull();
    expect(
      resolveChunkingPolicy({ text: "x".repeat(10_000), format: "mp3", capabilities: {} }),
    ).toBeNull();
  });

  it("returns null when text fits within softTarget", () => {
    expect(
      resolveChunkingPolicy({
        text: "x".repeat(2000),
        format: "mp3",
        capabilities: elevenLabsCaps,
      }),
    ).toBeNull();
  });

  it("activates with default soft target when text exceeds it", () => {
    const policy = resolveChunkingPolicy({
      text: "x".repeat(3000),
      format: "mp3",
      capabilities: elevenLabsCaps,
    });
    expect(policy).toMatchObject({
      hardLimit: 5000,
      softTarget: 2500,
      crossfadeMs: DEFAULT_CROSSFADE_MS,
      concurrency: DEFAULT_CHUNK_CONCURRENCY,
      supportsContext: true,
    });
  });

  it("respects user-supplied maxChunkChars override", () => {
    const policy = resolveChunkingPolicy({
      text: "x".repeat(3000),
      format: "mp3",
      capabilities: elevenLabsCaps,
      overrides: { maxChunkChars: 1000 },
    });
    expect(policy?.softTarget).toBe(1000);
  });

  it("rejects override that exceeds hardLimit", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(10_000),
        format: "mp3",
        capabilities: elevenLabsCaps,
        overrides: { maxChunkChars: 9999 },
      }),
    ).toThrow(/exceeds provider hard limit/);
  });

  it("rejects format that adapter cannot chunk", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(3000),
        format: "pcm",
        capabilities: elevenLabsCaps,
      }),
    ).toThrow(/cannot be chunked/);
  });

  it("rejects negative crossfade", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(3000),
        format: "mp3",
        capabilities: elevenLabsCaps,
        overrides: { crossfadeMs: -10 },
      }),
    ).toThrow(/crossfade_ms must be >= 0/);
  });

  it("rejects crossfade above max", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(3000),
        format: "mp3",
        capabilities: elevenLabsCaps,
        overrides: { crossfadeMs: 999 },
      }),
    ).toThrow(/exceeds maximum/);
  });

  it("rejects non-positive concurrency", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(3000),
        format: "mp3",
        capabilities: elevenLabsCaps,
        overrides: { chunkConcurrency: 0 },
      }),
    ).toThrow(/positive integer/);
  });

  it("rejects non-integer maxChunkChars", () => {
    expect(() =>
      resolveChunkingPolicy({
        text: "x".repeat(3000),
        format: "mp3",
        capabilities: elevenLabsCaps,
        overrides: { maxChunkChars: 1500.5 },
      }),
    ).toThrow(/positive integer/);
  });

  it("supportsContext is false when adapter lacks prev/next field", () => {
    const policy = resolveChunkingPolicy({
      text: "x".repeat(3000),
      format: "mp3",
      capabilities: openAiCaps,
    });
    expect(policy?.supportsContext).toBe(false);
  });
});

describe("planChunks", () => {
  it("returns context with index/total only when adapter doesn't support prev/next", () => {
    const policy = resolveChunkingPolicy({
      text: "First sentence. Second one. Third one. Fourth one. Fifth one.",
      format: "mp3",
      capabilities: openAiCaps,
      overrides: { maxChunkChars: 25 },
    });
    expect(policy).not.toBeNull();
    const chunks = planChunks(
      "First sentence. Second one. Third one. Fourth one. Fifth one.",
      policy!,
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.context.previousText).toBeUndefined();
      expect(chunk.context.nextText).toBeUndefined();
      expect(chunk.context.total).toBe(chunks.length);
    }
    expect(chunks[0].context.index).toBe(0);
    expect(chunks[chunks.length - 1].context.index).toBe(chunks.length - 1);
  });

  it("rejects when chunk count would exceed MAX_CHUNK_COUNT", () => {
    // Force tiny softTarget so the splitter produces > MAX_CHUNK_COUNT pieces.
    const text = "x ".repeat(MAX_CHUNK_COUNT + 100);
    const policy = resolveChunkingPolicy({
      text,
      format: "mp3",
      capabilities: { textLimit: { hardMaxChars: 5000, defaultSoftTarget: 2 } },
      overrides: { maxChunkChars: 2 },
    });
    expect(policy).not.toBeNull();
    expect(() => planChunks(text, policy!)).toThrow(/cap 1000/);
  });

  it("rejects when a protected region forces a chunk past hardLimit", () => {
    const text = "Intro. " + "[" + "x".repeat(60) + "]" + " outro";
    const policy = resolveChunkingPolicy({
      text,
      format: "mp3",
      capabilities: { textLimit: { hardMaxChars: 50, defaultSoftTarget: 30 } },
      overrides: { maxChunkChars: 30 },
    });
    expect(policy).not.toBeNull();
    expect(() => planChunks(text, policy!)).toThrow(/exceeds the provider hard limit/);
  });

  it("populates previousText/nextText when supportsContext", () => {
    const policy = resolveChunkingPolicy({
      text: "First sentence. Second sentence. Third sentence.",
      format: "mp3",
      capabilities: elevenLabsCaps,
      overrides: { maxChunkChars: 20 },
    });
    expect(policy?.supportsContext).toBe(true);
    const chunks = planChunks(
      "First sentence. Second sentence. Third sentence.",
      policy!,
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].context.previousText).toBeUndefined();
    expect(chunks[0].context.nextText).toBe(chunks[1].text);
    if (chunks.length >= 3) {
      expect(chunks[1].context.previousText).toBe(chunks[0].text);
    }
    expect(chunks[chunks.length - 1].context.nextText).toBeUndefined();
  });
});
