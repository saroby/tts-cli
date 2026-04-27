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

export interface ChunkContext {
  index: number;
  total: number;
  previousText?: string;
  nextText?: string;
}

export interface ProviderRequestContext {
  chunk?: ChunkContext;
}

export interface ProviderSynthesisRequest {
  actor: ResolvedActor;
  text: string;
  format: string;
  context?: ProviderRequestContext;
}

export interface ProviderTextLimit {
  hardMaxChars: number;
  defaultSoftTarget?: number;
}

export interface ProviderContextSupport {
  previousNextText?: boolean;
}

export interface ProviderCapabilities {
  textLimit?: ProviderTextLimit;
  context?: ProviderContextSupport;
  chunkableFormats?: ReadonlySet<string>;
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
  readonly capabilities?: ProviderCapabilities;
  dryRun(request: ProviderSynthesisRequest): Promise<ProviderDryRunResult>;
  synthesize(request: ProviderSynthesisRequest): Promise<ProviderSynthesisResult>;
}
