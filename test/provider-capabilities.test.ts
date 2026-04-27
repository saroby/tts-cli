import { describe, expect, it } from "vitest";

import { JOINABLE_FORMATS } from "../src/core/join.js";
import { getProviderAdapter } from "../src/providers/index.js";

describe("provider capabilities", () => {
  it("ElevenLabs declares 5000-char limit and supports prev/next context", () => {
    const adapter = getProviderAdapter("elevenlabs");
    expect(adapter.capabilities?.textLimit).toMatchObject({
      hardMaxChars: 5000,
      defaultSoftTarget: 2500,
    });
    expect(adapter.capabilities?.context?.previousNextText).toBe(true);
    expect(adapter.capabilities?.chunkableFormats?.has("mp3")).toBe(true);
  });

  it("OpenAI declares 4096-char limit and no prev/next support", () => {
    const adapter = getProviderAdapter("openai");
    expect(adapter.capabilities?.textLimit?.hardMaxChars).toBe(4096);
    expect(adapter.capabilities?.context?.previousNextText).toBeUndefined();
  });

  it("Cartesia declares 2500-char limit", () => {
    const adapter = getProviderAdapter("cartesia");
    expect(adapter.capabilities?.textLimit?.hardMaxChars).toBe(2500);
  });

  it("Typecast declares 3000-char limit and supports prev/next context", () => {
    const adapter = getProviderAdapter("typecast");
    expect(adapter.capabilities?.textLimit?.hardMaxChars).toBe(3000);
    expect(adapter.capabilities?.context?.previousNextText).toBe(true);
  });

  it("Edge-TTS does not declare textLimit (streaming, no chunking)", () => {
    const adapter = getProviderAdapter("edge-tts");
    expect(adapter.capabilities?.textLimit).toBeUndefined();
  });

  it("Chatterbox does not declare textLimit (local, user managed)", () => {
    const adapter = getProviderAdapter("chatterbox");
    expect(adapter.capabilities?.textLimit).toBeUndefined();
  });

  it("every provider's chunkableFormats is a subset of JOINABLE_FORMATS", () => {
    for (const name of ["openai", "elevenlabs", "cartesia", "typecast"]) {
      const formats = getProviderAdapter(name).capabilities?.chunkableFormats;
      if (!formats) continue;
      for (const f of formats) {
        expect(JOINABLE_FORMATS.has(f), `${name}.chunkableFormats includes "${f}" which the joiner cannot handle`).toBe(true);
      }
    }
  });
});
