import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  ensureSuccessfulResponse,
  getBooleanOption,
  getNumberOption,
  getRequiredEnv,
  getStringOption,
  localeToLanguage,
  mimeTypeForFormat,
} from "./helpers.js";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

export const elevenLabsAdapter: ProviderAdapter = {
  name: "elevenlabs",

  async dryRun(request) {
    const prepared = prepareRequest(request);
    return {
      provider: "elevenlabs",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    const prepared = prepareRequest(request);
    const apiKey = getRequiredEnv("ElevenLabs", ["ELEVENLABS_API_KEY"]);
    const response = await fetch(prepared.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(prepared.body),
    });

    await ensureSuccessfulResponse(response, "ElevenLabs");

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      format: prepared.effectiveFormat,
      mimeType: response.headers.get("content-type") ?? mimeTypeForFormat(prepared.effectiveFormat),
      request: prepared.preview,
    };
  },
};

function prepareRequest(request: ProviderSynthesisRequest): {
  url: string;
  body: Record<string, unknown>;
  preview: ProviderRequestPreview;
  effectiveFormat: string;
} {
  const baseUrl = (process.env.ELEVENLABS_BASE_URL ?? ELEVENLABS_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const voiceSettings = buildVoiceSettings(request);
  const languageCode = localeToLanguage(request.actor.locale);
  const explicitOutputFormat = getStringOption(request.actor.providerOptions, ["output_format", "outputFormat"]);
  const effectiveFormat = resolveEffectiveFormat(request.format, explicitOutputFormat);
  const query = new URLSearchParams({
    output_format: mapOutputFormat(request.format, explicitOutputFormat),
  });
  const optimizeStreamingLatency = getNumberOption(request.actor.providerOptions, [
    "optimize_streaming_latency",
    "optimizeStreamingLatency",
  ]);
  const enableLogging = getBooleanOption(request.actor.providerOptions, [
    "enable_logging",
    "enableLogging",
  ]);
  const seed = getNumberOption(request.actor.providerOptions, ["seed"]);
  const applyTextNormalization = getStringOption(request.actor.providerOptions, [
    "apply_text_normalization",
    "applyTextNormalization",
  ]);
  const previousText = getStringOption(request.actor.providerOptions, [
    "previous_text",
    "previousText",
  ]);
  const nextText = getStringOption(request.actor.providerOptions, [
    "next_text",
    "nextText",
  ]);

  if (optimizeStreamingLatency !== undefined) {
    query.set("optimize_streaming_latency", String(optimizeStreamingLatency));
  }

  if (enableLogging !== undefined) {
    query.set("enable_logging", String(enableLogging));
  }

  const body: Record<string, unknown> = {
    text: request.text,
    model_id: request.actor.model,
  };

  if (languageCode) {
    body.language_code = languageCode;
  }

  if (voiceSettings) {
    body.voice_settings = voiceSettings;
  }

  if (seed !== undefined) {
    body.seed = Math.round(seed);
  }

  if (applyTextNormalization) {
    body.apply_text_normalization = applyTextNormalization;
  }

  if (previousText) {
    body.previous_text = previousText;
  }

  if (nextText) {
    body.next_text = nextText;
  }

  const url = `${baseUrl}/text-to-speech/${encodeURIComponent(request.actor.voice)}?${query.toString()}`;

  return {
    url,
    body,
    preview: {
      runtime: "http",
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": "<ELEVENLABS_API_KEY>",
      },
      body,
    },
    effectiveFormat,
  };
}

function buildVoiceSettings(
  request: ProviderSynthesisRequest,
): Record<string, unknown> | undefined {
  const providerOptions = request.actor.providerOptions;
  const settings: Record<string, unknown> = {};
  const stability = getNumberOption(providerOptions, ["stability"]);
  const similarityBoost = getNumberOption(providerOptions, [
    "similarity_boost",
    "similarityBoost",
  ]);
  const style = getNumberOption(providerOptions, ["style"]);
  const useSpeakerBoost = getBooleanOption(providerOptions, [
    "use_speaker_boost",
    "useSpeakerBoost",
  ]);
  const speedFromProvider = getNumberOption(providerOptions, ["speed"]);

  if (stability !== undefined) {
    settings.stability = stability;
  }

  if (similarityBoost !== undefined) {
    settings.similarity_boost = similarityBoost;
  }

  if (style !== undefined) {
    settings.style = style;
  }

  if (useSpeakerBoost !== undefined) {
    settings.use_speaker_boost = useSpeakerBoost;
  }

  if (speedFromProvider !== undefined) {
    settings.speed = speedFromProvider;
  } else if (request.actor.synthesis?.speed !== undefined) {
    settings.speed = request.actor.synthesis.speed;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function mapOutputFormat(
  format: string,
  explicitOutputFormat: string | undefined,
): string {
  if (explicitOutputFormat) {
    return explicitOutputFormat;
  }

  switch (format) {
    case "mp3":
      return "mp3_44100_128";
    case "pcm":
      return "pcm_44100";
    case "ulaw":
    case "mu-law":
      return "ulaw_8000";
    default:
      throw new CliError(`ElevenLabs does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}

function resolveEffectiveFormat(
  requestedFormat: string,
  explicitOutputFormat: string | undefined,
): string {
  if (!explicitOutputFormat) {
    return requestedFormat;
  }

  const prefix = explicitOutputFormat.split("_")[0]?.toLowerCase();
  const canonicalFromExplicit =
    prefix === "mp3" ? "mp3" :
    prefix === "pcm" ? "pcm" :
    prefix === "ulaw" ? "ulaw" :
    undefined;

  if (!canonicalFromExplicit) {
    throw new CliError(
      `ElevenLabs: unrecognized provider output_format "${explicitOutputFormat}". Cannot determine canonical format.`,
    );
  }

  if (canonicalFromExplicit !== requestedFormat) {
    throw new CliError(
      `ElevenLabs: provider_options.output_format "${explicitOutputFormat}" produces ${canonicalFromExplicit} data, but CLI format is "${requestedFormat}". ` +
      `Set --format ${canonicalFromExplicit} or remove provider_options.output_format to avoid mislabeled files.`,
    );
  }

  return canonicalFromExplicit;
}
