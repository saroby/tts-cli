import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dryRunSay, prepareSpeech } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");

async function getPreview(
  actorName: string,
  text: string,
  overrides?: Parameters<typeof prepareSpeech>[3],
) {
  const registry = await loadActorRegistry({ actorFile: fixturePath });
  const prepared = prepareSpeech(registry, actorName, text, overrides);
  return await dryRunSay(prepared);
}

describe("provider dry-run previews", () => {
  it("builds OpenAI payloads", async () => {
    const preview = await getPreview("narrator", "Hello from OpenAI.");

    expect(preview.request).toMatchObject({
      runtime: "http",
      method: "POST",
      url: "https://api.openai.com/v1/audio/speech",
      body: {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: "Hello from OpenAI.",
        response_format: "mp3",
        speed: 0.98,
      },
    });
  });

  it("builds ElevenLabs payloads without altering text", async () => {
    const preview = await getPreview("mina", "(whispers) Did you hear that?");

    expect(preview.request).toMatchObject({
      runtime: "http",
      method: "POST",
      body: {
        text: "(whispers) Did you hear that?",
        model_id: "eleven_v3",
        language_code: "ko",
        voice_settings: {
          speed: 1,
        },
      },
    });
  });

  it("builds Cartesia payloads", async () => {
    const preview = await getPreview("james", "Cartesia line.");

    expect(preview.request).toMatchObject({
      runtime: "http",
      method: "POST",
      url: "https://api.cartesia.ai/tts/bytes",
      body: {
        model_id: "sonic-3",
        transcript: "Cartesia line.",
        voice: {
          mode: "id",
          id: "calm_british_male",
        },
        language: "en",
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          bit_rate: 128000,
        },
        generation_config: {
          speed: 0.97,
        },
      },
    });
  });

  it("builds Typecast payloads", async () => {
    const preview = await getPreview("sujin", "안녕하세요.");

    expect(preview.request).toMatchObject({
      runtime: "http",
      method: "POST",
      url: "https://api.typecast.ai/v1/text-to-speech",
      body: {
        voice_id: "tc_60e5426de8b95f1d3000d7b5",
        text: "안녕하세요.",
        model: "ssfm-v30",
        language: "kor",
        prompt: {
          emotion_type: "preset",
          emotion_preset: "normal",
        },
        output: {
          audio_format: "mp3",
          audio_tempo: 1.1,
          volume: 120,
          audio_pitch: 2,
        },
      },
    });
  });

  it("builds EdgeTTS runtime commands", async () => {
    const preview = await getPreview("aria", "Edge line.");

    expect(preview.request).toMatchObject({
      runtime: "node",
      command: [
        "node-edge-tts",
        "--voice",
        "en-US-AriaNeural",
        "--lang",
        "en-US",
        "--outputFormat",
        "audio-24khz-48kbitrate-mono-mp3",
        "--rate",
        "+5%",
        "--pitch",
        "default",
        "--volume",
        "default",
      ],
    });
  });

  it("builds EdgeTTS runtime commands for Korean actor presets", async () => {
    const preview = await getPreview("sunhi", "안녕하세요.");

    expect(preview.request).toMatchObject({
      runtime: "node",
      command: [
        "node-edge-tts",
        "--voice",
        "ko-KR-SunHiNeural",
        "--lang",
        "ko-KR",
        "--outputFormat",
        "audio-24khz-48kbitrate-mono-mp3",
        "--rate",
        "default",
        "--pitch",
        "default",
        "--volume",
        "default",
      ],
    });
  });

  it("builds Chatterbox runtime commands", async () => {
    const preview = await getPreview("clone", "Keep moving.");

    expect(preview.request.runtime).toBe("python");
    expect(preview.request.command?.slice(0, 4)).toEqual([
      "python3",
      expect.stringContaining("scripts/chatterbox-bridge.py"),
      "--model",
      "chatterbox-turbo",
    ]);
  });

  it("passes common synthesis speed to Chatterbox bridge", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-chatterbox-speed-"));
    const actorPath = join(tempDir, "actor.yaml");
    await writeFile(
      actorPath,
      [
        "version: 1",
        "actors:",
        "  clone:",
        "    provider: chatterbox",
        "    model: chatterbox-turbo",
        "    voice: default",
        "    synthesis:",
        "      speed: 1.2",
        "",
      ].join("\n"),
      "utf8",
    );

    const registry = await loadActorRegistry({ actorFile: actorPath });
    const prepared = prepareSpeech(registry, "clone", "Keep moving.");
    const preview = await dryRunSay(prepared);

    expect(preview.request.command).toContain("--speed");
    expect(preview.request.command).toContain("1.2");
  });

  it("resolves Chatterbox voice prompt paths relative to actor registry", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-chatterbox-"));
    const actorPath = join(tempDir, "actor.yaml");
    const promptPath = join(tempDir, "prompt.wav");
    await writeFile(promptPath, "");
    await writeFile(
      actorPath,
      [
        "version: 1",
        "actors:",
        "  clone:",
        "    provider: chatterbox",
        "    model: chatterbox-turbo",
        "    voice: default",
        "    provider_options:",
        "      voice_prompt_path: prompt.wav",
        "",
      ].join("\n"),
      "utf8",
    );

    const registry = await loadActorRegistry({ actorFile: actorPath });
    const prepared = prepareSpeech(registry, "clone", "Keep moving.");
    const preview = await dryRunSay(prepared);

    expect(preview.request.command).toContain(promptPath);
  });

  it("rejects unsupported Chatterbox output formats during dry-run", async () => {
    await expect(
      getPreview("clone", "Keep moving.", { format: "nonsense" }),
    ).rejects.toThrow("Chatterbox does not support output format: nonsense");
  });
});
