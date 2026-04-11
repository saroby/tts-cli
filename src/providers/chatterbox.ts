import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "../shared/errors.js";
import type { ProviderAdapter, ProviderRequestPreview, ProviderSynthesisRequest } from "./types.js";
import {
  getNumberOption,
  getStringOption,
  localeToLanguage,
  mimeTypeForFormat,
  withTempFile,
} from "./helpers.js";
import { resolveChatterboxPython } from "./chatterbox-runtime.js";

const execFileAsync = promisify(execFile);
const CHATTERBOX_BRIDGE_PATH = fileURLToPath(
  new URL("../../scripts/chatterbox-bridge.py", import.meta.url),
);
const SUPPORTED_FORMATS = new Set(["mp3", "wav"]);

export const chatterboxAdapter: ProviderAdapter = {
  name: "chatterbox",

  async dryRun(request) {
    const prepared = prepareCommand(request, "__DRY_RUN__");
    return {
      provider: "chatterbox",
      request: prepared.preview,
    };
  },

  async synthesize(request) {
    let preview: ProviderRequestPreview | undefined;
    const result = await withTempFile(
      "tts-cli-chatterbox",
      request.format,
      async (outputPath) => {
        const command = prepareCommand(request, outputPath);
        preview = command.preview;
        try {
          await execFileAsync(command.executable, command.args, {
            env: process.env,
            maxBuffer: 10 * 1024 * 1024,
          });
        } catch (error) {
          const stderr =
            typeof error === "object" &&
            error !== null &&
            "stderr" in error &&
            typeof error.stderr === "string"
              ? error.stderr.trim()
              : "";
          throw new CliError(
            stderr ||
              "Chatterbox execution failed. Ensure chatterbox-tts and its Python dependencies are installed.",
          );
        }
      },
    );

    return {
      audio: result.bytes,
      format: request.format,
      mimeType: mimeTypeForFormat(request.format),
      request: preview!,
    };
  },
};

function prepareCommand(
  request: ProviderSynthesisRequest,
  outputPath = "__OUTPUT__",
): {
  executable: string;
  args: string[];
  preview: ProviderRequestPreview;
} {
  assertSupportedFormat(request.format);

  const python = resolveChatterboxPython();
  const providerOptions = request.actor.providerOptions;
  const args = [
    CHATTERBOX_BRIDGE_PATH,
    "--model",
    request.actor.model,
    "--text",
    request.text,
    "--output",
    outputPath,
    "--format",
    request.format,
  ];

  const voicePromptPath = resolveVoicePromptPath(request);
  const languageId =
    getStringOption(providerOptions, ["language_id", "languageId"]) ??
    localeToLanguage(request.actor.locale);
  const device = getStringOption(providerOptions, ["device"]) ?? process.env.CHATTERBOX_DEVICE;
  const cfgWeight = getNumberOption(providerOptions, ["cfg_weight", "cfgWeight"]);
  const exaggeration = getNumberOption(providerOptions, ["exaggeration"]);
  const speed = getNumberOption(providerOptions, ["speed", "speed_factor", "speedFactor"]) ??
    request.actor.synthesis?.speed;

  if (voicePromptPath) {
    args.push("--voice-prompt", voicePromptPath);
  }

  if (languageId) {
    args.push("--language-id", languageId);
  }

  if (device) {
    args.push("--device", device);
  }

  if (cfgWeight !== undefined) {
    args.push("--cfg-weight", String(cfgWeight));
  }

  if (exaggeration !== undefined) {
    args.push("--exaggeration", String(exaggeration));
  }

  if (speed !== undefined) {
    args.push("--speed", String(speed));
  }

  return {
    executable: python,
    args,
    preview: {
      runtime: "python",
      command: [python, ...args],
      notes: [
        "Chatterbox requires Python plus chatterbox-tts runtime dependencies.",
        "Run `tts setup chatterbox` to create the local Python runtime.",
      ],
    },
  };
}

function resolveVoicePromptPath(request: ProviderSynthesisRequest): string | undefined {
  const providerOptions = request.actor.providerOptions;
  const explicitPath = getStringOption(providerOptions, [
    "audio_prompt_path",
    "audioPromptPath",
    "voice_prompt_path",
    "voicePromptPath",
  ]);

  if (explicitPath) {
    return resolveActorPath(request, explicitPath);
  }

  if (looksLikeAudioFile(request.actor.voice)) {
    const voicePath = resolveActorPath(request, request.actor.voice);
    if (existsSync(voicePath)) {
      return voicePath;
    }
  }

  return undefined;
}

function assertSupportedFormat(format: string): void {
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new CliError(`Chatterbox does not support output format: ${format}`, 1, { code: "FORMAT_UNSUPPORTED" });
  }
}

function resolveActorPath(
  request: ProviderSynthesisRequest,
  value: string,
): string {
  if (isAbsolute(value)) {
    return value;
  }

  return resolve(dirname(request.actor.sourcePath), value);
}

function looksLikeAudioFile(value: string): boolean {
  return /\.(wav|mp3|m4a|ogg|flac)$/i.test(value);
}
