#!/usr/bin/env node

import { Command } from "commander";

import { formatActorDetails, formatActorList, formatChatterboxSetupResult, formatRunManifest, formatRunSummary, formatSayPreview, formatSayResult } from "./format.js";
import { getActorOrThrow, loadActorRegistry } from "../domain/actor/loader.js";
import { isActorHidden, saveActorStates, setActorHiddenState } from "../domain/actor/state.js";
import { parseScriptFile } from "../domain/script/parser.js";
import { dryRunSay, dryRunScript, executeSay, executeScript, prepareSpeech } from "../core/tts.js";
import { ensureChatterboxRuntime } from "../providers/chatterbox-runtime.js";
import { CliError } from "../shared/errors.js";
import type { ActorCatalogState, ResolvedActor } from "../domain/actor/types.js";

interface RegistryOptions {
  actorFile?: string;
  actorStateFile?: string;
}

interface PrettyOption {
  pretty?: boolean;
}

interface SayCommandOptions extends RegistryOptions, PrettyOption {
  actor: string;
  text?: string;
  out?: string;
  dryRun?: boolean;
  voice?: string;
  format?: string;
}

interface RunCommandOptions extends RegistryOptions, PrettyOption {
  out?: string;
  dryRun?: boolean;
  format?: string;
  concurrency?: number;
}

interface ActorListOptions extends RegistryOptions, PrettyOption {
  all?: boolean;
}

interface ActorHideOptions extends RegistryOptions {
  reason?: string;
}

interface SetupCommandOptions extends PrettyOption {
  dryRun?: boolean;
  python?: string;
  venv?: string;
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name("tts")
    .description("Actor-centric multi-provider TTS CLI")
    .option("--verbose", "Include stack traces in error output")
    .showHelpAfterError();

  const actorCommand = program.command("actor").description("Inspect actor registry");

  actorCommand
    .command("list")
    .description("List available actors")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--actor-state-file <path>", "Use a specific actor state file")
    .option("--all", "Include hidden actors")
    .option("--pretty", "Human-readable output instead of JSON")
    .action(async (options: ActorListOptions) => {
      const registry = await loadActorRegistry({
        actorFile: options.actorFile,
        actorStateFile: options.actorStateFile,
        includeActorState: true,
      });
      const actors = Object.values(registry.actors)
        .filter((actor) => options.all || !isActorHidden(registry.actorStates, actor.name))
        .sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      if (options.pretty) {
        console.log(formatActorList(actors, {
          actorStates: registry.actorStates,
          includeHiddenState: options.all,
        }));
        return;
      }

      printJson(actors.map((actor) => actorToJson(actor, registry.actorStates[actor.name])));
    });

  actorCommand
    .command("show")
    .description("Show actor details")
    .argument("<name>", "Actor name")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--actor-state-file <path>", "Use a specific actor state file")
    .option("--pretty", "Human-readable output instead of JSON")
    .action(async (name: string, options: RegistryOptions & PrettyOption) => {
      const registry = await loadActorRegistry({
        actorFile: options.actorFile,
        actorStateFile: options.actorStateFile,
        includeActorState: true,
      });
      const actor = getActorOrThrow(registry, name);

      if (options.pretty) {
        console.log(formatActorDetails(actor, registry.actorStates[actor.name]));
        return;
      }

      printJson(actorToJson(actor, registry.actorStates[actor.name]));
    });

  actorCommand
    .command("hide")
    .description("Hide an actor from the default actor list")
    .argument("<name>", "Actor name")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--actor-state-file <path>", "Use a specific actor state file")
    .option("--reason <text>", "Record why this actor is hidden")
    .action(async (name: string, options: ActorHideOptions) => {
      const registry = await loadActorRegistry({
        actorFile: options.actorFile,
        actorStateFile: options.actorStateFile,
        includeActorState: true,
      });
      const actor = getActorOrThrow(registry, name);

      const actorStates = setActorHiddenState(
        registry.actorStates,
        actor.name,
        true,
        options.reason,
      );
      await saveActorStates(registry.actorStatePath, actorStates);
      printJson({ name: actor.name, hidden: true, reason: options.reason ?? null });
    });

  actorCommand
    .command("unhide")
    .description("Show a hidden actor in the default actor list")
    .argument("<name>", "Actor name")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--actor-state-file <path>", "Use a specific actor state file")
    .action(async (name: string, options: RegistryOptions) => {
      const registry = await loadActorRegistry({
        actorFile: options.actorFile,
        actorStateFile: options.actorStateFile,
        includeActorState: true,
      });
      const actor = getActorOrThrow(registry, name);

      const actorStates = setActorHiddenState(registry.actorStates, actor.name, false);
      await saveActorStates(registry.actorStatePath, actorStates);
      printJson({ name: actor.name, hidden: false });
    });

  program
    .command("setup")
    .description("Prepare optional provider runtimes")
    .command("chatterbox")
    .description("Create a local Python runtime for the Chatterbox provider")
    .option("--python <path>", "Python interpreter to use for the bootstrap step")
    .option("--venv <path>", "Virtualenv directory to create or reuse")
    .option("--dry-run", "Preview setup commands without executing them")
    .option("--pretty", "Human-readable output instead of JSON")
    .action(async (options: SetupCommandOptions) => {
      const result = await ensureChatterboxRuntime({
        dryRun: options.dryRun,
        python: options.python,
        venvDir: options.venv,
      });

      if (options.pretty) {
        console.log(formatChatterboxSetupResult(result));
        return;
      }

      printJson(result);
    });

  program
    .command("say")
    .description("Synthesize one speech line")
    .requiredOption("--actor <name>", "Actor name")
    .option("--text <text>", "Speech text (reads stdin if omitted)")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--out <path>", "Output file path")
    .option("--dry-run", "Preview provider payload")
    .option("--pretty", "Human-readable output instead of JSON")
    .option("--voice <voice>", "Temporarily override the actor voice")
    .option("--format <format>", "Override output format")
    .action(async (options: SayCommandOptions) => {
      const text = options.text ?? await readStdin();
      const registry = await loadActorRegistry({ actorFile: options.actorFile });
      const prepared = prepareSpeech(registry, options.actor, text, {
        voice: options.voice,
        format: options.format,
      });

      if (options.dryRun) {
        const preview = await dryRunSay(prepared);
        if (options.pretty) {
          console.log(formatSayPreview(preview));
          return;
        }

        printJson(preview);
        return;
      }

      if (!options.out) {
        throw new CliError("`tts say` requires --out unless --dry-run is used.", 1, { code: "MISSING_OUTPUT" });
      }

      const result = await executeSay(prepared, options.out);
      if (options.pretty) {
        console.log(formatSayResult(result));
        return;
      }

      printJson(result);
    });

  program
    .command("run")
    .description("Run a .tts script")
    .argument("<script>", "Path to .tts file")
    .option("--actor-file <path>", "Use a specific actor registry file")
    .option("--out <dir>", "Output directory")
    .option("--dry-run", "Preview provider payloads without synthesis")
    .option("--pretty", "Human-readable output instead of JSON")
    .option("--format <format>", "Override output format")
    .option("--concurrency <n>", "Number of parallel synthesis requests", (v: string) => {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) {
        throw new CliError(`--concurrency must be a positive integer, got: ${v}`, 1, { code: "INVALID_ARGUMENT" });
      }
      return n;
    })
    .action(async (scriptPath: string, options: RunCommandOptions) => {
      const registry = await loadActorRegistry({ actorFile: options.actorFile });
      const parsedScript = await parseScriptFile(scriptPath);

      if (options.dryRun) {
        const manifest = await dryRunScript(parsedScript, registry, {
          outDir: options.out,
          format: options.format,
          sourceLabel: scriptPath,
        });
        if (options.pretty) {
          console.log(formatRunManifest(manifest));
          return;
        }

        printJson(manifest);
        return;
      }

      const result = await executeScript(parsedScript, registry, {
        outDir: options.out,
        format: options.format,
        sourceLabel: scriptPath,
        concurrency: options.concurrency,
      });

      if (options.pretty) {
        console.log(formatRunSummary(result));
      } else {
        printJson(result.manifest);
      }

      if (result.hasErrors) {
        process.exitCode = 1;
      }
    });

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

function actorToJson(
  actor: ResolvedActor,
  actorState?: ActorCatalogState,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    name: actor.name,
    provider: actor.provider,
    model: actor.model,
    voice: actor.voice,
    locale: actor.locale,
    synthesis: actor.synthesis,
    provider_options: actor.providerOptions,
  };

  if (actorState?.hidden) {
    value.hidden = true;
  }

  if (actorState?.reason) {
    value.hidden_reason = actorState.reason;
  }

  return value;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new CliError(
      "No --text provided and stdin is a terminal. Use --text or pipe text to stdin.",
      1,
      { code: "MISSING_INPUT" },
    );
  }

  process.stdin.setEncoding("utf8");
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }
  const text = chunks.join("");

  const trimmed = text.replace(/\n$/, "");
  if (trimmed === "") {
    throw new CliError("Empty input from stdin.", 1, { code: "MISSING_INPUT" });
  }

  return trimmed;
}

function formatErrorJson(code: string, message: string, error: unknown, verbose: boolean): string {
  const payload: Record<string, unknown> = { code, message };
  if (verbose && error instanceof Error && error.stack) {
    payload.stack = error.stack;
  }
  return JSON.stringify({ error: payload });
}

void main().catch((error: unknown) => {
  const verbose = process.argv.includes("--verbose");

  if (error instanceof CliError) {
    console.error(formatErrorJson(error.code, error.message, error, verbose));
    process.exitCode = error.exitCode;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(formatErrorJson("ERR_UNKNOWN", message, error, verbose));
  process.exitCode = 1;
});
