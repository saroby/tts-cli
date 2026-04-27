import { describe, expect, it } from "vitest";

import { joinAudioChunks } from "../src/core/join.js";
import { generateSineMp3, probeDurationSec } from "./helpers/audio.js";

describe("joinAudioChunks", () => {
  it("returns the lone chunk untouched when N=1 and no trim", async () => {
    const single = await generateSineMp3(440, 0.5);
    const result = await joinAudioChunks([single], { format: "mp3", crossfadeMs: 50 });
    expect(result).toBe(single);
  });

  it("joins 3 mp3 chunks of mixed sample rates with N-input acrossfade", async () => {
    const a = await generateSineMp3(440, 1.0, 44100);
    const b = await generateSineMp3(523, 1.0, 22050);
    const c = await generateSineMp3(659, 1.0, 48000);

    const joined = await joinAudioChunks([a, b, c], { format: "mp3", crossfadeMs: 80 });
    const duration = await probeDurationSec(joined, "mp3");

    // 1 + (1 - 0.08) + (1 - 0.08) = 2.84
    expect(duration).toBeGreaterThan(2.78);
    expect(duration).toBeLessThan(2.92);
  });

  it("applies trimSilence to the joined output (single ffmpeg pass)", async () => {
    const a = await generateSineMp3(440, 1.0);
    const b = await generateSineMp3(523, 1.0);
    const joined = await joinAudioChunks([a, b], {
      format: "mp3",
      crossfadeMs: 50,
      trimSilence: true,
    });
    const duration = await probeDurationSec(joined, "mp3");
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(2.1);
  });

  it("rejects unsupported format", async () => {
    const a = await generateSineMp3(440, 0.2);
    await expect(
      joinAudioChunks([a, a], { format: "pcm", crossfadeMs: 50 }),
    ).rejects.toThrow(/cannot be joined/);
  });

  it("joins AAC chunks (uses ADTS muxer, not the demux-only `aac`)", async () => {
    const { execFile: execFileCb } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFile = promisify(execFileCb);
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join: joinPath } = await import("node:path");

    async function generateSineAac(freq: number, durationSec: number): Promise<Uint8Array> {
      const dir = await mkdtemp(joinPath(tmpdir(), "tts-cli-aac-"));
      const out = joinPath(dir, "s.aac");
      try {
        await execFile("ffmpeg", [
          "-hide_banner", "-loglevel", "error",
          "-f", "lavfi",
          "-i", `sine=frequency=${freq}:duration=${durationSec}`,
          "-ac", "1",
          "-ar", "44100",
          "-c:a", "aac",
          "-y",
          out,
        ]);
        return new Uint8Array(await readFile(out));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    const a = await generateSineAac(440, 0.5);
    const b = await generateSineAac(523, 0.5);
    const joined = await joinAudioChunks([a, b], { format: "aac", crossfadeMs: 50 });
    expect(joined.byteLength).toBeGreaterThan(0);
  });

  it("throws on empty input", async () => {
    await expect(
      joinAudioChunks([], { format: "mp3", crossfadeMs: 50 }),
    ).rejects.toThrow(/no chunks/);
  });
});
