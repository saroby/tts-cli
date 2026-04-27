import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { dryRunSay, executeSay, prepareSpeech } from "../src/core/say.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";
import { generateSineMp3, probeFileDurationSec, withTempDir } from "./helpers/audio.js";
import { captureJsonBodies } from "./helpers/fetch-mock.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("executeSay chunked path", () => {
  it("synthesizes N chunks, joins with crossfade, and writes single file", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test");

    const text = "Sentence A. ".repeat(150) + "Sentence B. ".repeat(150);
    expect(text.length).toBeGreaterThan(2500);

    const sineA = await generateSineMp3(440, 1.0);
    const sineB = await generateSineMp3(523, 1.0);
    const { bodies } = captureJsonBodies<{ text: string }>(
      (call) => (call % 2 === 0 ? sineA : sineB),
    );

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", text);

    await withTempDir("tts-cli-out", async (outDir) => {
      const outPath = join(outDir, "out.mp3");
      const result = await executeSay(prepared, outPath);

      expect(bodies.length).toBeGreaterThanOrEqual(2);
      expect(result.chunking?.chunkCount).toBe(bodies.length);
      expect(result.chunks?.length).toBe(bodies.length);

      const duration = await probeFileDurationSec(outPath);
      const expected = bodies.length - (bodies.length - 1) * 0.05;
      expect(duration).toBeGreaterThan(expected - 0.1);
      expect(duration).toBeLessThan(expected + 0.1);
    });
  });

  it("passes previous_text/next_text per chunk to ElevenLabs adapter", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test");

    const text = "First sentence. ".repeat(200) + "Final sentence.";
    const sine = await generateSineMp3(440, 0.5);
    const { bodies } = captureJsonBodies<{ text: string; previous_text?: string; next_text?: string }>(
      () => sine,
    );

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", text);

    await withTempDir("tts-cli-out", async (outDir) => {
      await executeSay(prepared, join(outDir, "out.mp3"));
    });

    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies[0].previous_text).toBeUndefined();
    expect(bodies[0].next_text).toBe(bodies[1].text);
    expect(bodies[bodies.length - 1].previous_text).toBe(bodies[bodies.length - 2].text);
    expect(bodies[bodies.length - 1].next_text).toBeUndefined();
  });

  it("falls back to single-shot when text fits softTarget", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test");
    const { fetchMock } = captureJsonBodies(() => new Uint8Array([1, 2, 3]));

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", "Short.");

    await withTempDir("tts-cli-out", async (outDir) => {
      const outPath = join(outDir, "out.mp3");
      const result = await executeSay(prepared, outPath);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.chunking).toBeUndefined();
      expect(result.chunks).toBeUndefined();
      const written = await readFile(outPath);
      expect(Array.from(written)).toEqual([1, 2, 3]);
    });
  });
});

describe("executeSay planning preflight", () => {
  it("does not invoke fetch when planning throws (chunk-count cap)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test");
    const { fetchMock } = captureJsonBodies(() => new Uint8Array([1]));

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    // Force >MAX_CHUNK_COUNT pieces via tiny --max-chunk-chars on a long text.
    const text = "x ".repeat(2500);
    const prepared = prepareSpeech(registry, "mina", text, {
      chunkOverrides: { maxChunkChars: 2 },
    });

    await withTempDir("tts-cli-out", async (outDir) => {
      await expect(
        executeSay(prepared, join(outDir, "out.mp3"), {
          chunkOverrides: { maxChunkChars: 2 },
        }),
      ).rejects.toThrow(/cap 1000/);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dryRunSay chunked path", () => {
  it("emits per-chunk request previews when chunking", async () => {
    const text = "Chunk it. ".repeat(400);
    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", text);
    const preview = await dryRunSay(prepared);

    expect(preview.chunking?.chunkCount).toBeGreaterThan(1);
    expect(preview.chunks?.length).toBe(preview.chunking?.chunkCount);
    expect(preview.request).toBe(preview.chunks![0].request);
    for (const c of preview.chunks!) {
      expect(c.request.method).toBe("POST");
    }
  });

  it("omits chunks/chunking metadata when text fits", async () => {
    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", "Short.");
    const preview = await dryRunSay(prepared);
    expect(preview.chunks).toBeUndefined();
    expect(preview.chunking).toBeUndefined();
  });
});
