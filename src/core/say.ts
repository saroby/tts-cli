import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { LoadedActorRegistry, ResolvedActor } from "../domain/actor/types.js";
import { getActorOrThrow } from "../domain/actor/loader.js";
import { getProviderAdapter } from "../providers/index.js";
import { normalizeOutputFormat } from "../providers/helpers.js";
import type {
  ProviderAdapter,
  ProviderSynthesisRequest,
  ProviderSynthesisResult,
} from "../providers/types.js";
import { ensureParentDirectory } from "../shared/fs.js";
import { trimSilence } from "./trim.js";
import {
  mergeChunkOverrides,
  resolveChunkingPolicy,
  type ChunkingPolicy,
  type ChunkOverrides,
} from "./chunk-policy.js";
import { planChunks, type PlannedChunk } from "./chunk-plan.js";
import { joinAudioChunks } from "./join.js";
import { runConcurrent } from "../shared/concurrency.js";
import type {
  ChunkPreview,
  ChunkingMetadata,
  PreparedSpeech,
  SayExecutionResult,
  SayPreview,
  SpeechOverrides,
} from "./types.js";

export function prepareSpeech(
  registry: LoadedActorRegistry,
  actorName: string,
  text: string,
  overrides: SpeechOverrides = {},
): PreparedSpeech {
  const actor = applyActorOverrides(getActorOrThrow(registry, actorName), overrides);
  const format = normalizeOutputFormat(overrides.format ?? actor.synthesis?.format);
  return { actor, text, format };
}

export async function dryRunSay(
  prepared: PreparedSpeech,
  overrides?: ChunkOverrides,
): Promise<SayPreview> {
  const adapter = getProviderAdapter(prepared.actor.provider);
  const policy = policyFor(prepared, adapter, overrides);

  if (!policy) {
    const dryRun = await adapter.dryRun(prepared);
    return basePreview(prepared, dryRun.request);
  }

  const planned = planChunks(prepared.text, policy);
  const chunkPreviews: ChunkPreview[] = await Promise.all(
    planned.map(async (chunk) => ({
      index: chunk.context.index,
      text: chunk.text,
      request: (await adapter.dryRun(buildChunkRequest(prepared, chunk))).request,
    })),
  );

  return {
    ...basePreview(prepared, chunkPreviews[0].request),
    chunking: chunkingMetadata(policy, planned.length),
    chunks: chunkPreviews,
  };
}

export async function executeSay(
  prepared: PreparedSpeech,
  outPath: string,
  options: { trimSilence?: boolean; chunkOverrides?: ChunkOverrides } = {},
): Promise<SayExecutionResult> {
  const adapter = getProviderAdapter(prepared.actor.provider);
  const policy = policyFor(prepared, adapter, options.chunkOverrides);

  const filePath = resolve(outPath);
  await ensureParentDirectory(filePath);

  if (!policy) {
    const result = await adapter.synthesize(prepared);
    const audio = options.trimSilence ? await trimSilence(result.audio, result.format) : result.audio;
    await writeFile(filePath, audio);
    return { ...basePreview(prepared, result.request), file: filePath };
  }

  const planned = planChunks(prepared.text, policy);
  const chunkResults = await synthesizeChunks(adapter, prepared, planned, policy.concurrency);
  const joined = await joinAudioChunks(
    chunkResults.map((r) => r.audio),
    { format: prepared.format, crossfadeMs: policy.crossfadeMs, trimSilence: options.trimSilence },
  );
  await writeFile(filePath, joined);

  const previews: ChunkPreview[] = chunkResults.map((r, idx) => ({
    index: idx,
    text: planned[idx].text,
    request: r.request,
  }));

  return {
    ...basePreview(prepared, previews[0].request),
    chunking: chunkingMetadata(policy, planned.length),
    chunks: previews,
    file: filePath,
  };
}

function policyFor(
  prepared: PreparedSpeech,
  adapter: ProviderAdapter,
  overrides: ChunkOverrides | undefined,
): ChunkingPolicy | null {
  return resolveChunkingPolicy({
    text: prepared.text,
    format: prepared.format,
    capabilities: adapter.capabilities,
    overrides: mergeChunkOverrides(prepared.actor, overrides),
  });
}

async function synthesizeChunks(
  adapter: ProviderAdapter,
  prepared: PreparedSpeech,
  chunks: PlannedChunk[],
  concurrency: number,
): Promise<ProviderSynthesisResult[]> {
  const results = new Array<ProviderSynthesisResult>(chunks.length);
  await runConcurrent(chunks.length, concurrency, async (i) => {
    results[i] = await adapter.synthesize(buildChunkRequest(prepared, chunks[i]));
  });
  return results;
}

function buildChunkRequest(prepared: PreparedSpeech, chunk: PlannedChunk): ProviderSynthesisRequest {
  return {
    actor: prepared.actor,
    text: chunk.text,
    format: prepared.format,
    context: { chunk: chunk.context },
  };
}

function basePreview(prepared: PreparedSpeech, request: SayPreview["request"]): SayPreview {
  return {
    actor: prepared.actor.name,
    provider: prepared.actor.provider,
    model: prepared.actor.model,
    voice: prepared.actor.voice,
    format: prepared.format,
    text: prepared.text,
    request,
  };
}

function chunkingMetadata(policy: ChunkingPolicy, chunkCount: number): ChunkingMetadata {
  return {
    hardLimit: policy.hardLimit,
    softTarget: policy.softTarget,
    chunkCount,
    crossfadeMs: policy.crossfadeMs,
    concurrency: policy.concurrency,
  };
}

function applyActorOverrides(actor: ResolvedActor, overrides: SpeechOverrides): ResolvedActor {
  return {
    ...actor,
    voice: overrides.voice ?? actor.voice,
  };
}
