import { describe, expect, it } from "vitest";

import { assertPreviewPlaybackSupported } from "../src/core/playback.js";

describe("preview playback guards", () => {
  it("rejects raw output formats before playback starts", () => {
    for (const format of ["pcm", "ulaw", "mulaw", "mu-law", " PCM "]) {
      expect(() => assertPreviewPlaybackSupported(format)).toThrow(
        /Audio preview does not support raw/,
      );
    }
  });

  it("allows self-describing preview formats", () => {
    for (const format of ["mp3", "wav", "aac", "opus", "flac"]) {
      expect(() => assertPreviewPlaybackSupported(format)).not.toThrow();
    }
  });
});
