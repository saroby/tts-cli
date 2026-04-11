import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { CliError } from "../shared/errors.js";
import { hasOwn, isRecord } from "../shared/object.js";

export function normalizeOutputFormat(format: string | undefined): string {
  return (format ?? "mp3").trim().toLowerCase();
}

export function getOptionalEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

export function getRequiredEnv(provider: string, names: string[]): string {
  const value = getOptionalEnv(names);
  if (!value) {
    throw new CliError(
      `${provider} credentials missing. Set one of: ${names.join(", ")}`,
      2,
      { code: "CREDENTIALS_MISSING" },
    );
  }

  return value;
}

export function getStringOption(
  options: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  const value = readOption(options, keys);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CliError(`Provider option must be a string: ${keys.join(" | ")}`);
  }

  return value;
}

export function getNumberOption(
  options: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  const value = readOption(options, keys);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new CliError(`Provider option must be a number: ${keys.join(" | ")}`);
  }

  return value;
}

export function getBooleanOption(
  options: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  const value = readOption(options, keys);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new CliError(`Provider option must be a boolean: ${keys.join(" | ")}`);
  }

  return value;
}

export function getObjectOption(
  options: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  const value = readOption(options, keys);
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new CliError(`Provider option must be an object: ${keys.join(" | ")}`);
  }

  return value;
}

export function localeToLanguage(locale: string | undefined): string | undefined {
  if (!locale) {
    return undefined;
  }

  return locale.split(/[-_]/)[0]?.toLowerCase();
}

export function localeToLowerTag(locale: string | undefined): string | undefined {
  return locale?.toLowerCase();
}

export function localeToIso6393(locale: string | undefined): string | undefined {
  const language = localeToLanguage(locale);
  if (!language) {
    return undefined;
  }

  switch (language) {
    case "ar":
      return "ara";
    case "bg":
      return "bul";
    case "cs":
      return "ces";
    case "da":
      return "dan";
    case "de":
      return "deu";
    case "el":
      return "ell";
    case "en":
      return "eng";
    case "es":
      return "spa";
    case "fi":
      return "fin";
    case "fr":
      return "fra";
    case "hi":
      return "hin";
    case "hr":
      return "hrv";
    case "hu":
      return "hun";
    case "id":
      return "ind";
    case "it":
      return "ita";
    case "ja":
      return "jpn";
    case "ko":
      return "kor";
    case "ms":
      return "msa";
    case "nl":
      return "nld";
    case "no":
      return "nor";
    case "pl":
      return "pol";
    case "pt":
      return "por";
    case "ro":
      return "ron";
    case "ru":
      return "rus";
    case "sk":
      return "slk";
    case "sv":
      return "swe";
    case "ta":
      return "tam";
    case "th":
      return "tha";
    case "tr":
      return "tur";
    case "uk":
      return "ukr";
    case "vi":
      return "vie";
    case "yue":
      return "yue";
    case "zh":
      return "zho";
    default:
      return undefined;
  }
}

export function relativeSpeedToPercent(speed: number | undefined): string {
  return relativeToPercent(speed);
}

export function relativeVolumeToPercent(volume: number | undefined): string {
  return relativeToPercent(volume);
}

function relativeToPercent(value: number | undefined): string {
  if (value === undefined || value === 1) {
    return "default";
  }

  const delta = Math.round((value - 1) * 100);
  return delta > 0 ? `+${delta}%` : `${delta}%`;
}

export function absolutePitchToPercent(pitch: number | undefined): string {
  if (pitch === undefined || pitch === 0) {
    return "default";
  }

  const rounded = Math.round(pitch);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

export function numberToPercentScale(
  value: number | undefined,
  defaultValue = 100,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.round(value * defaultValue);
}

export async function ensureSuccessfulResponse(
  response: Response,
  provider: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new CliError(await formatHttpError(response, provider), 1, { code: "PROVIDER_REQUEST_FAILED" });
}

export async function formatHttpError(
  response: Response,
  provider: string,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      if (isRecord(parsed)) {
        const message = readJsonErrorMessage(parsed);
        if (message) {
          return `${provider} request failed (${response.status}): ${message}`;
        }
      }
    } catch {
      // Ignore JSON parsing failure and fall back to plain text.
    }
  }

  const fallback = bodyText.trim() || response.statusText || "Unknown error";
  return `${provider} request failed (${response.status}): ${fallback}`;
}

export function mimeTypeForFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "aac":
      return "audio/aac";
    case "opus":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/L16";
    case "mulaw":
    case "mu-law":
      return "audio/basic";
    default:
      return "application/octet-stream";
  }
}

export async function withTempFile<T>(
  prefix: string,
  extension: string,
  handler: (path: string) => Promise<T>,
): Promise<{ value: T; bytes: Uint8Array }> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const filePath = join(directory, `audio.${extension}`);

  try {
    const value = await handler(filePath);
    const bytes = new Uint8Array(await readFile(filePath));
    return {
      value,
      bytes,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function readOption(
  options: Record<string, unknown> | undefined,
  keys: string[],
): unknown {
  if (!options) {
    return undefined;
  }

  for (const key of keys) {
    if (hasOwn(options, key)) {
      return options[key];
    }
  }

  return undefined;
}

function readJsonErrorMessage(value: Record<string, unknown>): string | undefined {
  if (typeof value.message === "string") {
    return value.message;
  }

  if (isRecord(value.message) && typeof value.message.msg === "string") {
    return value.message.msg;
  }

  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }

  if (typeof value.error === "string") {
    return value.error;
  }

  return undefined;
}
