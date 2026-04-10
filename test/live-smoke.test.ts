import { mkdtemp, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { executeSay, prepareSpeech } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");

const liveCases = [
  {
    actor: "narrator",
    credentials: ["OPENAI_API_KEY"],
    provider: "openai",
  },
  {
    actor: "mina",
    credentials: ["ELEVENLABS_API_KEY"],
    provider: "elevenlabs",
  },
  {
    actor: "james",
    credentials: ["CARTESIA_API_KEY"],
    provider: "cartesia",
  },
  {
    actor: "sujin",
    credentials: ["TYPECAST_API_TOKEN", "TYPECAST_API_KEY"],
    provider: "typecast",
  },
] as const;

describe("live provider smoke", () => {
  for (const testCase of liveCases) {
    const shouldRun = isLiveProviderEnabled(testCase.provider) &&
      hasAnyCredential(testCase.credentials);
    const testFn = shouldRun ? it : it.skip;

    testFn(`${testCase.provider} synthesizes a tiny clip`, async () => {
      const root = await mkdtemp(join(tmpdir(), `tts-cli-live-${testCase.provider}-`));
      const outPath = join(root, `${testCase.provider}.mp3`);
      const registry = await loadActorRegistry({ actorFile: fixturePath });
      const prepared = prepareSpeech(
        registry,
        testCase.actor,
        process.env.TTS_LIVE_TEXT ?? "Smoke test.",
      );

      const result = await executeSay(prepared, outPath);
      const file = await stat(result.file);

      expect(file.size).toBeGreaterThan(0);
      expect(result.provider).toBe(testCase.provider);
    });
  }
});

function isLiveProviderEnabled(provider: string): boolean {
  if (process.env.TTS_LIVE !== "1") {
    return false;
  }

  const requestedProviders = (process.env.TTS_LIVE_PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return requestedProviders.length === 0 || requestedProviders.includes(provider);
}

function hasAnyCredential(credentials: readonly string[]): boolean {
  return credentials.some((credential) => {
    const value = process.env[credential];
    return typeof value === "string" && value.trim() !== "";
  });
}
