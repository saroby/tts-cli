import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  ensureSuccessfulResponse,
  getNumberOption,
  getRequiredEnv,
  getStringOption,
  localeToIso6393,
  mimeTypeForFormat,
  numberToPercentScale,
} from "./helpers.js";

const TYPECAST_BASE_URL = "https://api.typecast.ai";

export const typecastAdapter: ProviderAdapter = {
  name: "typecast",

  async dryRun(request) {
    const prepared = prepareRequest(request);
    return {
      provider: "typecast",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    const prepared = prepareRequest(request);
    const apiKey = getRequiredEnv("Typecast", ["TYPECAST_API_KEY"]);
    const response = await fetch(prepared.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(prepared.body),
    });

    await ensureSuccessfulResponse(response, "Typecast");
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      throw new CliError(
        "Typecast returned JSON instead of audio. Verify the API response shape before using this adapter in live synthesis.",
      );
    }

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      format: request.format,
      mimeType: contentType || mimeTypeForFormat(request.format),
      request: prepared.preview,
    };
  },
};

function prepareRequest(request: ProviderSynthesisRequest): {
  url: string;
  body: Record<string, unknown>;
  preview: ProviderRequestPreview;
} {
  const audioFormat = mapAudioFormat(request.format);
  const baseUrl = (process.env.TYPECAST_BASE_URL ?? TYPECAST_BASE_URL).replace(/\/+$/, "");
  const prompt = buildPrompt(request);
  const output = buildOutput(request, audioFormat);
  const body: Record<string, unknown> = {
    voice_id: request.actor.voice,
    text: request.text,
    model: request.actor.model,
    output,
  };
  const language = localeToIso6393(request.actor.locale);
  const seed = getNumberOption(request.actor.providerOptions, ["seed"]);

  if (language) {
    body.language = language;
  }

  if (prompt) {
    body.prompt = prompt;
  }

  if (seed !== undefined) {
    body.seed = Math.round(seed);
  }

  const url = `${baseUrl}/v1/text-to-speech`;

  return {
    url,
    body,
    preview: {
      runtime: "http",
      method: "POST",
      url,
      headers: {
        "X-API-KEY": "<TYPECAST_API_KEY>",
        "Content-Type": "application/json",
      },
      body,
    },
  };
}

function buildPrompt(
  request: ProviderSynthesisRequest,
): Record<string, unknown> | undefined {
  const providerOptions = request.actor.providerOptions;
  const emotionType = getStringOption(providerOptions, ["emotion_type", "emotionType"]);
  const emotionPreset =
    getStringOption(providerOptions, ["emotion_preset", "emotionPreset"]) ??
    getStringOption(providerOptions, ["emotion_tone_preset", "emotionTonePreset"]);
  const emotionIntensity = getNumberOption(providerOptions, [
    "emotion_intensity",
    "emotionIntensity",
  ]);
  const previousText = getStringOption(providerOptions, ["previous_text", "previousText"]);
  const nextText = getStringOption(providerOptions, ["next_text", "nextText"]);
  const prompt: Record<string, unknown> = {};
  // emotion_type auto-inference is only defined for ssfm-v30; update this when new models are added
  const isV30Model = request.actor.model === "ssfm-v30";

  if (isV30Model) {
    const resolvedEmotionType =
      emotionType ??
      (emotionPreset ? "preset" : undefined) ??
      (previousText || nextText ? "smart" : undefined);

    if (resolvedEmotionType) {
      prompt.emotion_type = resolvedEmotionType;
    }
  }

  if (emotionPreset) {
    prompt.emotion_preset = emotionPreset;
  }

  if (emotionIntensity !== undefined) {
    prompt.emotion_intensity = emotionIntensity;
  }

  if (previousText) {
    prompt.previous_text = previousText;
  }

  if (nextText) {
    prompt.next_text = nextText;
  }

  return Object.keys(prompt).length > 0 ? prompt : undefined;
}

function buildOutput(
  request: ProviderSynthesisRequest,
  audioFormat: string,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    audio_format: audioFormat,
  };

  if (request.actor.synthesis?.speed !== undefined) {
    output.audio_tempo = request.actor.synthesis.speed;
  }

  const volume = numberToPercentScale(request.actor.synthesis?.volume);
  if (volume !== undefined) {
    output.volume = volume;
  }

  if (request.actor.synthesis?.pitch !== undefined) {
    output.audio_pitch = Math.round(request.actor.synthesis.pitch);
  }

  return output;
}

function mapAudioFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "mp3";
    case "wav":
      return "wav";
    default:
      throw new CliError(`Typecast does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}
