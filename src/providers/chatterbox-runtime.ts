import { execFile } from "node:child_process";
import { constants, existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { writeJsonFile } from "../shared/fs.js";
import { CliError } from "../shared/errors.js";

const execFileAsync = promisify(execFile);

const DEFAULT_PYTHON_CANDIDATES = [
  "python3.12",
  "python3.11",
  "python3.10",
  "python3",
] as const;
const RUNTIME_IMPORT_SNIPPET = "import chatterbox; import torchaudio";

export const DEFAULT_CHATTERBOX_VENV_DIR = ".venv-chatterbox";
export const CHATTERBOX_RUNTIME_CONFIG_DIR = ".tts-cli";
export const CHATTERBOX_RUNTIME_CONFIG_FILE = "chatterbox.json";

export interface ChatterboxRuntimeConfig {
  provider: "chatterbox";
  python: string;
  venv_dir: string;
}

export interface ChatterboxSetupOptions {
  cwd?: string;
  dryRun?: boolean;
  python?: string;
  venvDir?: string;
}

export interface ChatterboxSetupResult {
  provider: "chatterbox";
  status: "ok" | "dry-run";
  bootstrap_python: string | null;
  runtime_python: string;
  venv_dir: string;
  config_path: string;
  already_ready: boolean;
  actions: {
    create_venv: boolean;
    install_dependencies: boolean;
    write_config: boolean;
  };
  commands: string[][];
  notes: string[];
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface SetupDependencies {
  fileExists(path: string): Promise<boolean>;
  run(executable: string, args: string[], options: { cwd: string }): Promise<CommandResult>;
  writeJson(path: string, value: unknown): Promise<void>;
}

const defaultDependencies: SetupDependencies = {
  async fileExists(path) {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },

  async run(executable, args, options) {
    const result = await execFileAsync(executable, args, {
      cwd: options.cwd,
      env: process.env,
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },

  async writeJson(path, value) {
    await writeJsonFile(path, value);
  },
};

export async function ensureChatterboxRuntime(
  options: ChatterboxSetupOptions = {},
  dependencies: SetupDependencies = defaultDependencies,
): Promise<ChatterboxSetupResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const venvDir = resolve(cwd, options.venvDir ?? DEFAULT_CHATTERBOX_VENV_DIR);
  const runtimePython = resolve(venvDir, pythonBinaryRelativePath());
  const configPath = resolve(cwd, CHATTERBOX_RUNTIME_CONFIG_DIR, CHATTERBOX_RUNTIME_CONFIG_FILE);

  const hasRuntimePython = await dependencies.fileExists(runtimePython);
  let alreadyReady = false;

  if (hasRuntimePython) {
    alreadyReady = await isChatterboxRuntimeReady(runtimePython, cwd, dependencies);
  }

  const commands: string[][] = [];
  let bootstrapPython: string | null = null;

  if (!hasRuntimePython) {
    bootstrapPython = await resolveBootstrapPython(options.python, cwd, dependencies);
    commands.push([bootstrapPython, "-m", "venv", venvDir]);
  }

  if (!alreadyReady) {
    commands.push([runtimePython, "-m", "pip", "install", "--upgrade", "pip"]);
    commands.push([
      runtimePython,
      "-m",
      "pip",
      "install",
      "torch",
      "torchaudio",
      "chatterbox-tts",
    ]);
  }

  const result: ChatterboxSetupResult = {
    provider: "chatterbox",
    status: options.dryRun ? "dry-run" : "ok",
    bootstrap_python: bootstrapPython,
    runtime_python: runtimePython,
    venv_dir: venvDir,
    config_path: configPath,
    already_ready: alreadyReady,
    actions: {
      create_venv: !hasRuntimePython,
      install_dependencies: !alreadyReady,
      write_config: true,
    },
    commands,
    notes: [
      "The Chatterbox adapter reads CHATTERBOX_PYTHON first, then falls back to the repo-local runtime config.",
      "Setup writes a repo-local config so future `tts say` calls can reuse the same Python runtime.",
    ],
  };

  if (options.dryRun) {
    return result;
  }

  for (const command of commands) {
    await runSetupCommand(command, cwd, dependencies);
  }

  await dependencies.writeJson(configPath, {
    provider: "chatterbox",
    python: runtimePython,
    venv_dir: venvDir,
  } satisfies ChatterboxRuntimeConfig);

  return result;
}

export function resolveChatterboxPython(cwd = process.cwd()): string {
  const fromEnv = process.env.CHATTERBOX_PYTHON?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const config = readChatterboxRuntimeConfig(cwd);
  if (config?.python) {
    return config.python;
  }

  return "python3";
}

export function readChatterboxRuntimeConfig(cwd = process.cwd()): ChatterboxRuntimeConfig | null {
  const configPath = resolve(cwd, CHATTERBOX_RUNTIME_CONFIG_DIR, CHATTERBOX_RUNTIME_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.provider === "chatterbox" &&
      typeof parsed.python === "string" &&
      parsed.python.trim() !== "" &&
      typeof parsed.venv_dir === "string" &&
      parsed.venv_dir.trim() !== ""
    ) {
      return parsed as ChatterboxRuntimeConfig;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveBootstrapPython(
  explicitPython: string | undefined,
  cwd: string,
  dependencies: SetupDependencies,
): Promise<string> {
  if (explicitPython) {
    await assertPythonAvailable(explicitPython, cwd, dependencies);
    return explicitPython;
  }

  for (const candidate of DEFAULT_PYTHON_CANDIDATES) {
    try {
      await assertPythonAvailable(candidate, cwd, dependencies);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new CliError(
    "Could not find a usable Python 3 interpreter for Chatterbox setup. Pass --python explicitly.",
    1,
    { code: "SETUP_FAILED" },
  );
}

async function assertPythonAvailable(
  executable: string,
  cwd: string,
  dependencies: SetupDependencies,
): Promise<void> {
  try {
    await dependencies.run(
      executable,
      ["-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"],
      { cwd },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Failed to use Python interpreter "${executable}": ${message}`, 1, {
      code: "SETUP_FAILED",
    });
  }
}

async function isChatterboxRuntimeReady(
  runtimePython: string,
  cwd: string,
  dependencies: SetupDependencies,
): Promise<boolean> {
  try {
    await dependencies.run(runtimePython, ["-c", RUNTIME_IMPORT_SNIPPET], { cwd });
    return true;
  } catch {
    return false;
  }
}

async function runSetupCommand(
  command: string[],
  cwd: string,
  dependencies: SetupDependencies,
): Promise<void> {
  const [executable, ...args] = command;
  try {
    await dependencies.run(executable, args, { cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Chatterbox setup failed while running "${command.join(" ")}": ${message}`, 1, {
      code: "SETUP_FAILED",
    });
  }
}

function pythonBinaryRelativePath(): string {
  return process.platform === "win32" ? join("Scripts", "python.exe") : join("bin", "python");
}
