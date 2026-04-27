import type { ResolvedActor } from "../domain/actor/types.js";
import type { ProviderRequestPreview } from "../providers/types.js";
import type { ChunkOverrides } from "./chunk-policy.js";

export interface PreparedSpeech {
  actor: ResolvedActor;
  text: string;
  format: string;
}

export interface ChunkPreview {
  index: number;
  text: string;
  request: ProviderRequestPreview;
}

export interface ChunkingMetadata {
  hardLimit: number;
  softTarget: number;
  chunkCount: number;
  crossfadeMs: number;
  concurrency: number;
}

export interface SayPreview {
  actor: string;
  provider: string;
  model: string;
  voice: string;
  format: string;
  text: string;
  request: ProviderRequestPreview;
  chunking?: ChunkingMetadata;
  chunks?: ChunkPreview[];
}

export interface SayExecutionResult extends SayPreview {
  file: string;
}

export interface RunManifestItem {
  index: number;
  actor: string;
  provider?: string;
  model?: string;
  voice?: string;
  text: string;
  file?: string;
  status: "ok" | "error" | "dry-run";
  error?: string;
  request?: ProviderRequestPreview;
  chunking?: ChunkingMetadata;
  chunks?: ChunkPreview[];
}

export interface RunManifest {
  source: string;
  items: RunManifestItem[];
}

export interface RunExecutionResult {
  manifest: RunManifest;
  manifestPath?: string;
  hasErrors: boolean;
}

export interface SpeechOverrides {
  voice?: string;
  format?: string;
  trimSilence?: boolean;
  chunkOverrides?: ChunkOverrides;
}

export interface RunOptions {
  outDir?: string;
  format?: string;
  sourceLabel?: string;
  concurrency?: number;
  trimSilence?: boolean;
  chunkOverrides?: ChunkOverrides;
}
