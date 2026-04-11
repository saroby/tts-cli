import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CHATTERBOX_RUNTIME_CONFIG_DIR,
  CHATTERBOX_RUNTIME_CONFIG_FILE,
  ensureChatterboxRuntime,
  readChatterboxRuntimeConfig,
  resolveChatterboxPython,
} from "../src/providers/chatterbox-runtime.js";

describe("chatterbox setup", () => {
  it("plans venv creation and dependency install when runtime is missing", async () => {
    const fileExists = vi.fn(async () => false);
    const run = vi.fn(async (executable: string, args: string[]) => {
      if (
        executable === "python3.12" &&
        args[0] === "-c" &&
        args[1]?.includes("sys.version_info")
      ) {
        return { stdout: "3.12\n", stderr: "" };
      }

      return { stdout: "", stderr: "" };
    });
    const writeJson = vi.fn(async () => {});

    const result = await ensureChatterboxRuntime(
      {
        cwd: "/repo",
        dryRun: true,
      },
      { fileExists, run, writeJson },
    );

    expect(result.status).toBe("dry-run");
    expect(result.runtime_python).toBe("/repo/.venv-chatterbox/bin/python");
    expect(result.actions).toEqual({
      create_venv: true,
      install_dependencies: true,
      write_config: true,
    });
    expect(result.commands).toEqual([
      ["python3.12", "-m", "venv", "/repo/.venv-chatterbox"],
      ["/repo/.venv-chatterbox/bin/python", "-m", "pip", "install", "--upgrade", "pip"],
      [
        "/repo/.venv-chatterbox/bin/python",
        "-m",
        "pip",
        "install",
        "torch",
        "torchaudio",
        "chatterbox-tts",
      ],
    ]);
    expect(writeJson).not.toHaveBeenCalled();
  });

  it("reuses an existing ready runtime and only writes config", async () => {
    const fileExists = vi.fn(async (path: string) => path === "/repo/custom-venv/bin/python");
    const run = vi.fn(async (executable: string, args: string[]) => {
      if (executable === "/repo/custom-venv/bin/python" && args[1] === "import chatterbox; import torchaudio") {
        return { stdout: "", stderr: "" };
      }

      throw new Error(`unexpected command: ${executable} ${args.join(" ")}`);
    });
    const writeJson = vi.fn(async () => {});

    const result = await ensureChatterboxRuntime(
      {
        cwd: "/repo",
        venvDir: "custom-venv",
      },
      { fileExists, run, writeJson },
    );

    expect(result.already_ready).toBe(true);
    expect(result.bootstrap_python).toBeNull();
    expect(result.commands).toEqual([]);
    expect(writeJson).toHaveBeenCalledWith(
      "/repo/.tts-cli/chatterbox.json",
      {
        provider: "chatterbox",
        python: "/repo/custom-venv/bin/python",
        venv_dir: "/repo/custom-venv",
      },
    );
  });

  it("reads repo-local chatterbox runtime config when env is unset", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "tts-cli-chatterbox-config-"));
    const configPath = join(cwd, CHATTERBOX_RUNTIME_CONFIG_DIR, CHATTERBOX_RUNTIME_CONFIG_FILE);
    await mkdir(join(cwd, CHATTERBOX_RUNTIME_CONFIG_DIR), { recursive: true });

    await writeFile(
      configPath,
      JSON.stringify({
        provider: "chatterbox",
        python: "/runtime/python",
        venv_dir: "/runtime",
      }),
      "utf8",
    );

    vi.stubEnv("CHATTERBOX_PYTHON", "");

    expect(readChatterboxRuntimeConfig(cwd)).toEqual({
      provider: "chatterbox",
      python: "/runtime/python",
      venv_dir: "/runtime",
    });
    expect(resolveChatterboxPython(cwd)).toBe("/runtime/python");
  });
});
