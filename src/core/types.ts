import type { ResolvedActor } from "../domain/actor/types.js";
import type { ProviderRequestPreview } from "../providers/types.js";

export interface PreparedSpeech {
  actor: ResolvedActor;
  text: string;
  format: string;
}

export interface SayPreview {
  actor: string;
  provider: string;
  model: string;
  voice: string;
  format: string;
  text: string;
  request: ProviderRequestPreview;
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
}

export interface RunOptions {
  outDir?: string;
  format?: string;
  sourceLabel?: string;
  concurrency?: number;
  trimSilence?: boolean;
}
