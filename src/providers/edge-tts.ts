import { EdgeTTS } from "node-edge-tts";

import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  absolutePitchToPercent,
  getNumberOption,
  getStringOption,
  mimeTypeForFormat,
  relativeSpeedToPercent,
  relativeVolumeToPercent,
  withTempFile,
} from "./helpers.js";

export const edgeTtsAdapter: ProviderAdapter = {
  name: "edge-tts",

  async dryRun(request) {
    const prepared = prepareRequest(request);
    return {
      provider: "edge-tts",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    const prepared = prepareRequest(request);
    const result = await withTempFile("tts-cli-edge", request.format, async (outputPath) => {
      const tts = new EdgeTTS(prepared.config);
      await tts.ttsPromise(request.text, outputPath);
      return undefined;
    });

    return {
      audio: result.bytes,
      format: request.format,
      mimeType: mimeTypeForFormat(request.format),
      request: prepared.preview,
    };
  },
};

function prepareRequest(request: ProviderSynthesisRequest): {
  config: ConstructorParameters<typeof EdgeTTS>[0];
  preview: ProviderRequestPreview;
} {
  const providerOptions = request.actor.providerOptions;
  const config = {
    voice: request.actor.voice,
    lang: request.actor.locale,
    outputFormat: mapOutputFormat(request.format),
    rate:
      getStringOption(providerOptions, ["rate"]) ??
      relativeSpeedToPercent(request.actor.synthesis?.speed),
    pitch:
      getStringOption(providerOptions, ["pitch"]) ??
      absolutePitchToPercent(request.actor.synthesis?.pitch),
    volume:
      getStringOption(providerOptions, ["volume"]) ??
      relativeVolumeToPercent(request.actor.synthesis?.volume),
    proxy: getStringOption(providerOptions, ["proxy"]) ?? process.env.EDGE_TTS_PROXY,
    timeout: getNumberOption(providerOptions, ["timeout"]) ?? 10000,
  } satisfies ConstructorParameters<typeof EdgeTTS>[0];

  return {
    config,
    preview: {
      runtime: "node",
      command: [
        "node-edge-tts",
        "--voice",
        config.voice ?? "",
        "--lang",
        config.lang ?? "",
        "--outputFormat",
        config.outputFormat ?? "",
        "--rate",
        config.rate ?? "default",
        "--pitch",
        config.pitch ?? "default",
        "--volume",
        config.volume ?? "default",
      ],
      notes: [
        "EdgeTTS uses Microsoft Edge's read-aloud service through the node-edge-tts runtime.",
        "The model field is not used by EdgeTTS; voice selection determines the synthesis engine.",
      ],
    },
  };
}

function mapOutputFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "audio-24khz-48kbitrate-mono-mp3";
    case "wav":
      return "riff-24khz-16bit-mono-pcm";
    default:
      throw new CliError(`EdgeTTS does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}
