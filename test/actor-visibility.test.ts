import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const fixturePath = resolve("fixtures/actors/basic.yaml");

async function runCli(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "node",
    ["--import", "tsx", "src/cli/index.ts", ...args],
    {
      cwd: resolve("."),
    },
  );

  return stdout.trimEnd();
}

describe("actor visibility CLI", () => {
  it("hides actors from the default list and shows hidden state with --all", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-actor-state-"));
    const statePath = join(tempDir, "actor-state.yaml");

    await runCli([
      "actor",
      "hide",
      "narrator",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
      "--reason",
      "robotic",
    ]);

    const stateFile = await readFile(statePath, "utf8");
    expect(stateFile).toContain("narrator:");
    expect(stateFile).toContain("hidden: true");
    expect(stateFile).toContain("reason: robotic");

    const visibleList = await runCli([
      "actor",
      "list",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);
    expect(visibleList).not.toContain("narrator");
    expect(visibleList).toContain("mina");

    const fullList = await runCli([
      "actor",
      "list",
      "--all",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);
    expect(fullList).toContain('"narrator"');
    expect(fullList).toContain('"hidden_reason":"robotic"');

    const details = await runCli([
      "actor",
      "show",
      "narrator",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);
    expect(details).toContain('"hidden":true');
    expect(details).toContain('"hidden_reason":"robotic"');
  });

  it("unhides actors by removing their hidden state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tts-cli-actor-state-"));
    const statePath = join(tempDir, "actor-state.yaml");

    await runCli([
      "actor",
      "hide",
      "mina",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);
    await runCli([
      "actor",
      "unhide",
      "mina",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);

    const visibleList = await runCli([
      "actor",
      "list",
      "--actor-file",
      fixturePath,
      "--actor-state-file",
      statePath,
    ]);
    expect(visibleList).toContain("mina");

    const stateFile = await readFile(statePath, "utf8");
    expect(stateFile).not.toContain("mina:");
  });
});
