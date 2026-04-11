import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

import { prepareSpeech } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";
import { getProviderAdapter } from "../src/providers/index.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");
const audioBytes = Uint8Array.from([1, 2, 3, 4]);

const httpProviderCases = [
  {
    actor: "narrator",
    credentials: ["OPENAI_API_KEY"],
    expectedMimeType: "audio/mpeg",
    provider: "openai",
    providerLabel: "OpenAI",
  },
  {
    actor: "mina",
    credentials: ["ELEVENLABS_API_KEY"],
    expectedMimeType: "audio/mpeg",
    provider: "elevenlabs",
    providerLabel: "ElevenLabs",
  },
  {
    actor: "james",
    credentials: ["CARTESIA_API_KEY"],
    expectedMimeType: "audio/mpeg",
    provider: "cartesia",
    providerLabel: "Cartesia",
  },
  {
    actor: "sujin",
    credentials: ["TYPECAST_API_KEY"],
    expectedMimeType: "audio/mpeg",
    provider: "typecast",
    providerLabel: "Typecast",
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider synthesize contract", () => {
  it.each(httpProviderCases)(
    "$provider returns bytes, format, mimeType, and request metadata",
    async ({ actor, credentials, expectedMimeType }) => {
      stubCredentials(credentials);
      const fetchMock = vi.fn().mockImplementation(async () =>
        createAudioResponse(audioBytes, expectedMimeType)
      );
      vi.stubGlobal("fetch", fetchMock);

      const prepared = await getPreparedSpeech(actor, "Smoke test.");
      const adapter = getProviderAdapter(prepared.actor.provider);
      const result = await adapter.synthesize(prepared);

      expect(Array.from(result.audio)).toEqual(Array.from(audioBytes));
      expect(result.format).toBe(prepared.format);
      expect(result.mimeType).toBe(expectedMimeType);
      expect(result.request).toMatchObject({
        method: "POST",
        runtime: "http",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each(httpProviderCases)(
    "$provider surfaces normalized JSON HTTP errors",
    async ({ actor, credentials, providerLabel }) => {
      stubCredentials(credentials);
      const fetchMock = vi.fn().mockImplementation(async () =>
        createJsonResponse(429, {
          error: {
            message: "quota exceeded",
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const prepared = await getPreparedSpeech(actor, "Smoke test.");
      const adapter = getProviderAdapter(prepared.actor.provider);

      await expect(adapter.synthesize(prepared)).rejects.toThrow(
        `${providerLabel} request failed (429): quota exceeded`,
      );
    },
  );

  it.each(httpProviderCases)(
    "$provider refuses to synthesize without credentials",
    async ({ actor, credentials, providerLabel }) => {
      clearCredentials(credentials);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const prepared = await getPreparedSpeech(actor, "Smoke test.");
      const adapter = getProviderAdapter(prepared.actor.provider);

      await expect(adapter.synthesize(prepared)).rejects.toThrow(
        `${providerLabel} credentials missing`,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("typecast fails fast when the provider returns JSON on success", async () => {
    stubCredentials(["TYPECAST_API_KEY"]);
    const fetchMock = vi.fn().mockImplementation(async () =>
      createJsonResponse(200, {
        result: "unexpected JSON envelope",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const prepared = await getPreparedSpeech("sujin", "Smoke test.");
    const adapter = getProviderAdapter(prepared.actor.provider);

    await expect(adapter.synthesize(prepared)).rejects.toThrow(
      "Typecast returned JSON instead of audio.",
    );
  });
});

async function getPreparedSpeech(actorName: string, text: string) {
  const registry = await loadActorRegistry({ actorFile: fixturePath });
  return prepareSpeech(registry, actorName, text);
}

function stubCredentials(credentials: readonly string[]): void {
  const [primary, ...rest] = credentials;
  vi.stubEnv(primary, "test-key");

  for (const credential of rest) {
    vi.stubEnv(credential, "");
  }
}

function clearCredentials(credentials: readonly string[]): void {
  for (const credential of credentials) {
    vi.stubEnv(credential, "");
  }
}

function createAudioResponse(
  bytes: Uint8Array,
  contentType: string,
): Response {
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
    },
    status: 200,
  });
}

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}
