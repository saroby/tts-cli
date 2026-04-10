import type { ResolvedActor } from "../domain/actor/types.js";

export interface ProviderRequestPreview {
  runtime: "http" | "node" | "python";
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  command?: string[];
  notes?: string[];
}

export interface ProviderSynthesisRequest {
  actor: ResolvedActor;
  text: string;
  format: string;
}

export interface ProviderDryRunResult {
  provider: string;
  request: ProviderRequestPreview;
}

export interface ProviderSynthesisResult {
  audio: Uint8Array;
  format: string;
  mimeType: string;
  request: ProviderRequestPreview;
}

export interface ProviderAdapter {
  readonly name: string;
  dryRun(request: ProviderSynthesisRequest): Promise<ProviderDryRunResult>;
  synthesize(request: ProviderSynthesisRequest): Promise<ProviderSynthesisResult>;
}
