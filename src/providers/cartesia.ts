import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  ensureSuccessfulResponse,
  getBooleanOption,
  getRequiredEnv,
  getStringOption,
  localeToLanguage,
  mimeTypeForFormat,
} from "./helpers.js";

const CARTESIA_BASE_URL = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-03-01";

export const cartesiaAdapter: ProviderAdapter = {
  name: "cartesia",

  async dryRun(request) {
    const prepared = prepareRequest(request);
    return {
      provider: "cartesia",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    const prepared = prepareRequest(request);
    const apiKey = getRequiredEnv("Cartesia", ["CARTESIA_API_KEY"]);
    const response = await fetch(prepared.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": prepared.version,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prepared.body),
    });

    await ensureSuccessfulResponse(response, "Cartesia");

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
  version: string;
  body: Record<string, unknown>;
  preview: ProviderRequestPreview;
} {
  const version = process.env.CARTESIA_API_VERSION ?? CARTESIA_VERSION;
  const baseUrl = (process.env.CARTESIA_BASE_URL ?? CARTESIA_BASE_URL).replace(/\/+$/, "");
  const providerOptions = request.actor.providerOptions;
  const generationConfig: Record<string, unknown> = {};
  const emotion = getStringOption(providerOptions, ["emotion"]);
  const save = getBooleanOption(providerOptions, ["save"]);
  const pronunciationDictId = getStringOption(providerOptions, [
    "pronunciation_dict_id",
    "pronunciationDictId",
  ]);

  if (request.actor.synthesis?.speed !== undefined) {
    generationConfig.speed = request.actor.synthesis.speed;
  }

  if (request.actor.synthesis?.volume !== undefined) {
    generationConfig.volume = request.actor.synthesis.volume;
  }

  if (emotion) {
    generationConfig.emotion = emotion;
  }

  const body: Record<string, unknown> = {
    model_id: request.actor.model,
    transcript: request.text,
    voice: {
      mode: "id",
      id: request.actor.voice,
    },
    output_format: mapOutputFormat(request.format),
  };

  const language = localeToLanguage(request.actor.locale);
  if (language) {
    body.language = language;
  }

  if (Object.keys(generationConfig).length > 0) {
    body.generation_config = generationConfig;
  }

  if (save !== undefined) {
    body.save = save;
  }

  if (pronunciationDictId) {
    body.pronunciation_dict_id = pronunciationDictId;
  }

  const url = `${baseUrl}/tts/bytes`;

  return {
    url,
    version,
    body,
    preview: {
      runtime: "http",
      method: "POST",
      url,
      headers: {
        Authorization: "Bearer <CARTESIA_API_KEY>",
        "Cartesia-Version": version,
        "Content-Type": "application/json",
      },
      body,
    },
  };
}

function mapOutputFormat(format: string): Record<string, unknown> {
  switch (format) {
    case "mp3":
      return {
        container: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      };
    case "wav":
      return {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44100,
      };
    default:
      throw new CliError(`Cartesia does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}
