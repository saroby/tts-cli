import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

import { prepareSpeech } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";
import { getProviderAdapter } from "../src/providers/index.js";
import { captureJsonBodies } from "./helpers/fetch-mock.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");
const tinyAudio = new Uint8Array([1]);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider chunk context", () => {
  it("ElevenLabs body picks up previous_text/next_text from request.context.chunk", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test");
    const { bodies } = captureJsonBodies(() => tinyAudio);

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "mina", "second chunk");
    const adapter = getProviderAdapter(prepared.actor.provider);
    await adapter.synthesize({
      ...prepared,
      context: {
        chunk: {
          index: 1,
          total: 3,
          previousText: "first chunk",
          nextText: "third chunk",
        },
      },
    });

    expect(bodies[0].previous_text).toBe("first chunk");
    expect(bodies[0].next_text).toBe("third chunk");
  });

  it("Typecast body picks up previous_text/next_text from request.context.chunk and overrides provider_options", async () => {
    vi.stubEnv("TYPECAST_API_KEY", "test");
    const { bodies } = captureJsonBodies<{ prompt?: { previous_text?: string; next_text?: string } }>(
      () => tinyAudio,
    );

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "sujin", "current");
    const adapter = getProviderAdapter(prepared.actor.provider);
    await adapter.synthesize({
      ...prepared,
      context: {
        chunk: {
          index: 1,
          total: 2,
          previousText: "before",
        },
      },
    });

    expect(bodies[0].prompt?.previous_text).toBe("before");
  });

  it("OpenAI ignores context.chunk (no prev/next field in API)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const { bodies } = captureJsonBodies(() => tinyAudio);

    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const prepared = prepareSpeech(registry, "narrator", "any text");
    const adapter = getProviderAdapter(prepared.actor.provider);
    await adapter.synthesize({
      ...prepared,
      context: {
        chunk: { index: 0, total: 2, nextText: "next" },
      },
    });

    expect(bodies[0].previous_text).toBeUndefined();
    expect(bodies[0].next_text).toBeUndefined();
  });
});
