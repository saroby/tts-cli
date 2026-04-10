import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  ensureSuccessfulResponse,
  getBooleanOption,
  getNumberOption,
  getRequiredEnv,
  getStringOption,
  localeToLowerTag,
  mimeTypeForFormat,
  numberToPercentScale,
} from "./helpers.js";

const TYPECAST_BASE_URL = "https://typecast.ai";

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
    const apiToken = getRequiredEnv("Typecast", [
      "TYPECAST_API_TOKEN",
      "TYPECAST_API_KEY",
    ]);
    const response = await fetch(prepared.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
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
  const providerOptions = request.actor.providerOptions;
  const body: Record<string, unknown> = {
    text: request.text,
    tts_mode: "actor",
    actor_id: request.actor.voice,
    lang: localeToLowerTag(request.actor.locale) ?? "auto",
    model_version: request.actor.model,
    xapi_audio_format: audioFormat,
  };

  const hd = getBooleanOption(providerOptions, ["xapi_hd", "xapiHd"]);
  const emotionPreset = getStringOption(providerOptions, [
    "emotion_tone_preset",
    "emotionTonePreset",
  ]);
  const emotionPrompt = getStringOption(providerOptions, [
    "emotion_prompt",
    "emotionPrompt",
  ]);
  const maxSeconds = getNumberOption(providerOptions, ["max_seconds", "maxSeconds"]);
  const duration = getNumberOption(providerOptions, ["duration"]);
  const lastPitch = getNumberOption(providerOptions, ["last_pitch", "lastPitch"]);

  if (hd !== undefined) {
    body.xapi_hd = hd;
  }

  if (emotionPreset) {
    body.emotion_tone_preset = emotionPreset;
  }

  if (emotionPrompt) {
    body.emotion_prompt = emotionPrompt;
  }

  if (maxSeconds !== undefined) {
    body.max_seconds = maxSeconds;
  }

  if (duration !== undefined) {
    body.duration = duration;
  }

  if (lastPitch !== undefined) {
    body.last_pitch = Math.round(lastPitch);
  }

  if (request.actor.synthesis?.speed !== undefined) {
    body.tempo = request.actor.synthesis.speed;
  }

  const volume = numberToPercentScale(request.actor.synthesis?.volume);
  if (volume !== undefined) {
    body.volume = volume;
  }

  if (request.actor.synthesis?.pitch !== undefined) {
    body.pitch = Math.round(request.actor.synthesis.pitch);
  }

  const url = `${baseUrl}/api/text-to-speech`;

  return {
    url,
    body,
    preview: {
      runtime: "http",
      method: "POST",
      url,
      headers: {
        Authorization: "Bearer <TYPECAST_API_TOKEN>",
        "Content-Type": "application/json",
      },
      body,
    },
  };
}

function mapAudioFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "mp3";
    case "wav":
      return "wav";
    case "mulaw":
    case "mu-law":
      return "mu-law";
    default:
      throw new CliError(`Typecast does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}
