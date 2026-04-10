import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeScript } from "../src/core/tts.js";
import { loadActorRegistry } from "../src/domain/actor/loader.js";
import { parseScriptFile } from "../src/domain/script/parser.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("executeScript", () => {
  it("atomically replaces the output directory on success", async () => {
    const fixture = await createOpenAiFixture([
      "narrator: first line",
      "narrator: second line",
    ]);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      createAudioResponse(Uint8Array.from([7, 8, 9]))
    ));

    const registry = await loadActorRegistry({ actorFile: fixture.actorPath });
    const script = await parseScriptFile(fixture.scriptPath);
    const result = await executeScript(script, registry, {
      concurrency: 2,
      outDir: fixture.outDir,
      sourceLabel: fixture.scriptPath,
    });

    expect(result.hasErrors).toBe(false);
    expect(await readdir(fixture.outDir)).toEqual([
      "0001-narrator.mp3",
      "0002-narrator.mp3",
      "manifest.json",
    ]);
    await expect(readFile(join(fixture.outDir, "stale.txt"))).rejects.toThrow();
    expect(Array.from(await readFile(join(fixture.outDir, "0001-narrator.mp3")))).toEqual([
      7,
      8,
      9,
    ]);

    const manifest = JSON.parse(
      await readFile(join(fixture.outDir, "manifest.json"), "utf8"),
    ) as { items: Array<{ status: string }> };
    expect(manifest.items.map((item) => item.status)).toEqual(["ok", "ok"]);
  });

  it("persists successful files and an error manifest on partial failure", async () => {
    const fixture = await createOpenAiFixture([
      "narrator: first line",
      "narrator: second line",
    ]);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(async () => createAudioResponse(Uint8Array.from([1, 2, 3])))
      .mockImplementationOnce(async () =>
        createJsonResponse(503, {
          error: {
            message: "upstream unavailable",
          },
        })
      ));

    const registry = await loadActorRegistry({ actorFile: fixture.actorPath });
    const script = await parseScriptFile(fixture.scriptPath);
    const result = await executeScript(script, registry, {
      outDir: fixture.outDir,
      sourceLabel: fixture.scriptPath,
    });

    expect(result.hasErrors).toBe(true);
    expect(await readdir(fixture.outDir)).toEqual([
      "0001-narrator.mp3",
      "manifest.json",
    ]);
    expect(Array.from(await readFile(join(fixture.outDir, "0001-narrator.mp3")))).toEqual([
      1,
      2,
      3,
    ]);
    await expect(readFile(join(fixture.outDir, "0002-narrator.mp3"))).rejects.toThrow();

    expect(result.manifest.items).toMatchObject([
      {
        file: "0001-narrator.mp3",
        status: "ok",
      },
      {
        error: "OpenAI request failed (503): upstream unavailable",
        file: "0002-narrator.mp3",
        request: {
          method: "POST",
          runtime: "http",
        },
        status: "error",
      },
    ]);
  });
});

async function createOpenAiFixture(lines: string[]): Promise<{
  actorPath: string;
  outDir: string;
  scriptPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tts-cli-run-"));
  const actorPath = join(root, "actor.yaml");
  const scriptPath = join(root, "script.tts");
  const outDir = join(root, "out");

  await writeFile(
    actorPath,
    [
      "version: 1",
      "actors:",
      "  narrator:",
      "    provider: openai",
      "    model: gpt-4o-mini-tts",
      "    voice: alloy",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(scriptPath, `${lines.join("\n")}\n`, "utf8");
  await mkdir(outDir);
  await writeFile(join(outDir, "stale.txt"), "stale", "utf8");

  return {
    actorPath,
    outDir,
    scriptPath,
  };
}

function createAudioResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    headers: {
      "content-type": "audio/mpeg",
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
