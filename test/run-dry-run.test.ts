import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dryRunScript } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";
import { parseScriptFile } from "../src/domain/script/parser.js";

describe("run dry-run", () => {
  it("builds a manifest and preserves raw speech text", async () => {
    const registry = await loadActorRegistry({
      actorFile: resolve("fixtures/actors/basic.yaml"),
    });
    const script = await parseScriptFile(resolve("fixtures/scripts/basic.tts"));
    const manifest = await dryRunScript(script, registry, {
      outDir: "out/demo",
      sourceLabel: "fixtures/scripts/basic.tts",
    });

    expect(manifest).toMatchObject({
      source: "fixtures/scripts/basic.tts",
    });
    expect(manifest.items[1]).toMatchObject({
      index: 2,
      actor: "mina",
      provider: "elevenlabs",
      text: "(whispers) Did you hear that?",
      file: "0002-mina.mp3",
      status: "dry-run",
    });
  });
});
