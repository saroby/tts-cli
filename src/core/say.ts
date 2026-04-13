import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { LoadedActorRegistry, ResolvedActor } from "../domain/actor/types.js";
import { getActorOrThrow } from "../domain/actor/loader.js";
import { getProviderAdapter } from "../providers/index.js";
import { normalizeOutputFormat } from "../providers/helpers.js";
import { ensureParentDirectory } from "../shared/fs.js";
import { trimSilence } from "./trim.js";
import type { PreparedSpeech, SayExecutionResult, SayPreview, SpeechOverrides } from "./types.js";

export function prepareSpeech(
  registry: LoadedActorRegistry,
  actorName: string,
  text: string,
  overrides: SpeechOverrides = {},
): PreparedSpeech {
  const actor = applyActorOverrides(getActorOrThrow(registry, actorName), overrides);
  // Format priority: CLI --format > actor synthesis.format > "mp3"
  const format = normalizeOutputFormat(overrides.format ?? actor.synthesis?.format);

  return {
    actor,
    text,
    format,
  };
}

export async function dryRunSay(prepared: PreparedSpeech): Promise<SayPreview> {
  const adapter = getProviderAdapter(prepared.actor.provider);
  const dryRun = await adapter.dryRun(prepared);

  return {
    actor: prepared.actor.name,
    provider: prepared.actor.provider,
    model: prepared.actor.model,
    voice: prepared.actor.voice,
    format: prepared.format,
    text: prepared.text,
    request: dryRun.request,
  };
}

export async function executeSay(
  prepared: PreparedSpeech,
  outPath: string,
  options?: { trimSilence?: boolean },
): Promise<SayExecutionResult> {
  const adapter = getProviderAdapter(prepared.actor.provider);
  const result = await adapter.synthesize(prepared);
  const filePath = resolve(outPath);

  const audio = options?.trimSilence
    ? await trimSilence(result.audio, result.format)
    : result.audio;

  await ensureParentDirectory(filePath);
  await writeFile(filePath, audio);

  return {
    actor: prepared.actor.name,
    provider: prepared.actor.provider,
    model: prepared.actor.model,
    voice: prepared.actor.voice,
    format: result.format,
    text: prepared.text,
    request: result.request,
    file: filePath,
  };
}

function applyActorOverrides(
  actor: ResolvedActor,
  overrides: SpeechOverrides,
): ResolvedActor {
  return {
    ...actor,
    voice: overrides.voice ?? actor.voice,
  };
}
