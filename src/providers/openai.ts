import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  ensureSuccessfulResponse,
  getRequiredEnv,
  getStringOption,
  mimeTypeForFormat,
} from "./helpers.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const SUPPORTED_FORMATS = new Set(["mp3", "wav", "opus", "aac", "flac", "pcm"]);

export const openAiAdapter: ProviderAdapter = {
  name: "openai",

  async dryRun(request) {
    const prepared = prepareRequest(request);
    return {
      provider: "openai",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    const prepared = prepareRequest(request);
    const apiKey = getRequiredEnv("OpenAI", ["OPENAI_API_KEY"]);
    const response = await fetch(prepared.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prepared.body),
    });

    await ensureSuccessfulResponse(response, "OpenAI");

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      format: request.format,
      mimeType: response.headers.get("content-type") ?? mimeTypeForFormat(request.format),
      request: prepared.preview,
    };
  },
};

function prepareRequest(request: ProviderSynthesisRequest): {
  url: string;
  body: Record<string, unknown>;
  preview: ProviderRequestPreview;
} {
  if (!SUPPORTED_FORMATS.has(request.format)) {
    throw new CliError(`OpenAI does not support output format: ${request.format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? OPENAI_BASE_URL).replace(/\/+$/, "");
  const instructions = getStringOption(request.actor.providerOptions, ["instructions"]);
  const notes: string[] = [];

  if (request.actor.synthesis?.pitch !== undefined) {
    notes.push("OpenAI speech API does not expose pitch control.");
  }

  if (request.actor.synthesis?.volume !== undefined) {
    notes.push("OpenAI speech API does not expose volume control.");
  }

  const body: Record<string, unknown> = {
    model: request.actor.model,
    voice: request.actor.voice,
    input: request.text,
    response_format: request.format,
  };

  if (request.actor.synthesis?.speed !== undefined) {
    body.speed = request.actor.synthesis.speed;
  }

  if (instructions) {
    body.instructions = instructions;
  }

  return {
    url: `${baseUrl}/audio/speech`,
    body,
    preview: {
      runtime: "http",
      method: "POST",
      url: `${baseUrl}/audio/speech`,
      headers: {
        Authorization: "Bearer <OPENAI_API_KEY>",
        "Content-Type": "application/json",
      },
      body,
      notes: notes.length > 0 ? notes : undefined,
    },
  };
}
