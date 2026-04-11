import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { formatActorDetails, formatActorList } from "../src/cli/format.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";

const fixturePath = resolve("fixtures/actors/basic.yaml");

describe("actor registry loader", () => {
  it("loads actors and merges registry defaults", async () => {
    const registry = await loadActorRegistry({ actorFile: fixturePath });

    expect(registry.actors.narrator.synthesis).toEqual({
      speed: 0.98,
      format: "mp3",
    });
    expect(registry.actors.mina).toMatchObject({
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "ZJCNdZEjYwkOElxugmW2",
      locale: "ko-KR",
      synthesis: {
        speed: 1,
        format: "mp3",
      },
    });
    expect(registry.actors.sunhi).toMatchObject({
      provider: "edge-tts",
      model: "edge-readaloud",
      voice: "ko-KR-SunHiNeural",
      locale: "ko-KR",
      synthesis: {
        speed: 1,
        format: "mp3",
      },
    });
  });

  it("auto-discovers actor.yaml in cwd", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-"));
    const discoveredPath = join(tempDir, "actor.yaml");
    await copyFile(fixturePath, discoveredPath);

    const registry = await loadActorRegistry({ cwd: tempDir });
    expect(registry.sourcePath).toBe(discoveredPath);
  });

  it("includes YAML parser details for invalid registries", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-"));
    const brokenPath = join(tempDir, "actor.yaml");
    await writeFile(
      brokenPath,
      [
        "version: 1",
        "actors:",
        "  bad:",
        "    provider: openai",
        "    model: gpt-4o-mini-tts",
        "    voice: alloy",
        "    synthesis: [",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(loadActorRegistry({ actorFile: brokenPath })).rejects.toThrow(
      /Failed to parse actor registry:[\s\S]*line \d+, column \d+/,
    );
  });

  it("formats actor list and details for human output", async () => {
    const registry = await loadActorRegistry({ actorFile: fixturePath });
    const actors = Object.values(registry.actors).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    expect(formatActorList(actors)).toMatchInlineSnapshot(`
      "Available actors
      
        aria      edge-tts    edge-readaloud    en-US-AriaNeural
        clone     chatterbox  chatterbox-turbo  default
        james     cartesia    sonic-3           calm_british_male
        mina      elevenlabs  eleven_v3         ZJCNdZEjYwkOElxugmW2
        narrator  openai      gpt-4o-mini-tts   alloy
        sujin     typecast    ssfm-v30          tc_60e5426de8b95f1d3000d7b5
        sunhi     edge-tts    edge-readaloud    ko-KR-SunHiNeural"
    `);
    expect(formatActorDetails(registry.actors.mina)).toMatchInlineSnapshot(`
      "name: mina
      provider: elevenlabs
      model: eleven_v3
      voice: ZJCNdZEjYwkOElxugmW2
      locale: ko-KR
      
      synthesis
        speed: 1
        format: mp3"
    `);
  });
});
