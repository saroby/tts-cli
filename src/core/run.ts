import { mkdtemp, rename, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";

import type { LoadedActorRegistry } from "../domain/actor/types.js";
import type { ParsedScript, SpeechNode } from "../domain/script/types.js";
import type { ProviderRequestPreview } from "../providers/types.js";
import { CliError } from "../shared/errors.js";
import { ensureDirectory, writeJsonFile } from "../shared/fs.js";
import { prepareSpeech, dryRunSay, executeSay } from "./say.js";
import type { PreparedSpeech, RunExecutionResult, RunManifest, RunManifestItem, RunOptions } from "./types.js";

export async function dryRunScript(
  parsedScript: ParsedScript,
  registry: LoadedActorRegistry,
  options: RunOptions = {},
): Promise<RunManifest> {
  const items: RunManifestItem[] = [];

  for (const [offset, speech] of parsedScript.speechNodes.entries()) {
    const index = offset + 1;
    let prepared: PreparedSpeech | undefined;
    let fileName: string | undefined;
    try {
      prepared = prepareSpeech(registry, speech.actor, speech.text, {
        format: options.format,
      });
      const preview = await dryRunSay(prepared);
      fileName = options.outDir
        ? buildOutputFileName(index, preview.actor, preview.format)
        : undefined;
      items.push({
        index,
        actor: preview.actor,
        provider: preview.provider,
        model: preview.model,
        voice: preview.voice,
        text: preview.text,
        file: fileName,
        status: "dry-run",
        request: preview.request,
      });
    } catch (error) {
      items.push(buildErrorItem(index, speech, error, prepared, fileName));
    }
  }

  return {
    source: options.sourceLabel ?? parsedScript.sourcePath ?? "<stdin>",
    items,
  };
}

export async function executeScript(
  parsedScript: ParsedScript,
  registry: LoadedActorRegistry,
  options: RunOptions,
): Promise<RunExecutionResult> {
  if (!options.outDir) {
    throw new CliError("`tts run` requires --out unless --dry-run is used.", 1, { code: "MISSING_OUTPUT" });
  }

  const outputDirectory = resolve(options.outDir);
  const parentDir = dirname(outputDirectory);
  await ensureDirectory(parentDir);

  // Stage outputs in a temp directory (sibling, same filesystem for atomic rename)
  const stagingDir = await mkdtemp(join(parentDir, ".tts-run-"));

  const speeches = parsedScript.speechNodes;
  const items: RunManifestItem[] = new Array(speeches.length);
  let hasErrors = false;
  const concurrency = Math.max(1, options.concurrency ?? 1);

  try {
    await runConcurrent(speeches.length, concurrency, async (offset) => {
      const speech = speeches[offset];
      const index = offset + 1;
      let prepared: PreparedSpeech | undefined;
      let fileName: string | undefined;

      try {
        prepared = prepareSpeech(registry, speech.actor, speech.text, {
          format: options.format,
        });
        fileName = buildOutputFileName(index, prepared.actor.name, prepared.format);
        await executeSay(prepared, resolve(stagingDir, fileName), {
          trimSilence: options.trimSilence,
        });
        items[offset] = {
          index,
          actor: prepared.actor.name,
          provider: prepared.actor.provider,
          model: prepared.actor.model,
          voice: prepared.actor.voice,
          text: prepared.text,
          file: fileName,
          status: "ok",
        };
      } catch (error) {
        hasErrors = true;
        let request: ProviderRequestPreview | undefined;
        if (prepared) {
          try {
            const preview = await dryRunSay(prepared);
            request = preview.request;
          } catch {
            // dry-run also failed; skip request capture
          }
        }
        items[offset] = buildErrorItem(index, speech, error, prepared, fileName, request);
      }
    });

    const manifest: RunManifest = {
      source: options.sourceLabel ?? parsedScript.sourcePath ?? "<stdin>",
      items,
    };
    await writeJsonFile(resolve(stagingDir, "manifest.json"), manifest);

    // Atomic swap: remove old output directory, rename staging into place
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(stagingDir, outputDirectory);

    const manifestPath = resolve(outputDirectory, "manifest.json");

    return {
      manifest,
      manifestPath,
      hasErrors,
    };
  } catch (error) {
    // Clean up staging directory on unexpected failure
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function buildOutputFileName(
  index: number,
  actorName: string,
  format: string,
): string {
  const paddedIndex = String(index).padStart(4, "0");
  const safeActorName = actorName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]/g, "-");

  return `${paddedIndex}-${safeActorName || "actor"}.${format}`;
}

function buildErrorItem(
  index: number,
  speech: SpeechNode,
  error: unknown,
  prepared?: PreparedSpeech,
  fileName?: string,
  request?: ProviderRequestPreview,
): RunManifestItem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    index,
    actor: prepared?.actor.name ?? speech.actor,
    provider: prepared?.actor.provider,
    model: prepared?.actor.model,
    voice: prepared?.actor.voice,
    text: speech.text,
    file: fileName,
    status: "error",
    error: message,
    request,
  };
}

export async function runConcurrent(
  count: number,
  concurrency: number,
  fn: (index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isFinite(concurrency)) {
    concurrency = 1;
  }
  if (concurrency <= 1) {
    for (let i = 0; i < count; i++) {
      await fn(i);
    }
    return;
  }

  let next = 0;
  async function worker(): Promise<void> {
    while (next < count) {
      const i = next++;
      await fn(i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, () => worker()),
  );
}
