import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliError } from "../shared/errors.js";
import { runFfmpeg, silenceRemoveFilter } from "./ffmpeg.js";
import { trimSilence } from "./trim.js";

export const JOINABLE_FORMATS: ReadonlySet<string> = new Set([
  "mp3", "wav", "aac", "opus", "flac",
]);

const TARGET_SAMPLE_RATE = 44100;

export interface JoinOptions {
  format: string;
  crossfadeMs: number;
  trimSilence?: boolean;
}

// Disk round-trip is deliberate: acrossfade requires N parallel input streams,
// which can't share a single stdin pipe. Named pipes would be more complex
// without meaningful win for typical chunk counts.
export async function joinAudioChunks(
  chunks: Uint8Array[],
  options: JoinOptions,
): Promise<Uint8Array> {
  if (chunks.length === 0) {
    throw new CliError("joinAudioChunks called with no chunks", 1, { code: "INVALID_ARGUMENT" });
  }

  if (chunks.length === 1) {
    return options.trimSilence ? trimSilence(chunks[0], options.format) : chunks[0];
  }

  if (!JOINABLE_FORMATS.has(options.format)) {
    throw new CliError(
      `Format "${options.format}" cannot be joined. Use one of: ${[...JOINABLE_FORMATS].sort().join(", ")}.`,
      1,
      { code: "JOIN_FORMAT_UNSUPPORTED" },
    );
  }

  const inputFormat = mapInputFormat(options.format);
  const outputFormat = mapOutputFormat(options.format);
  const workDir = await mkdtemp(join(tmpdir(), "tts-cli-join-"));

  try {
    const inputPaths = await Promise.all(
      chunks.map(async (bytes, i) => {
        const path = join(workDir, `chunk-${i}.${options.format}`);
        await writeFile(path, bytes);
        return path;
      }),
    );

    const outputPath = join(workDir, `out.${options.format}`);
    const args = buildFfmpegArgs(inputPaths, outputPath, options, inputFormat, outputFormat);
    await runFfmpeg(args, { failureCode: "FFMPEG_JOIN_FAILED", failureLabel: "FFmpeg join failed" });
    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function mapInputFormat(format: string): string {
  // AAC: demuxer is `aac`, muxer is `adts` — different names for the same container.
  return format === "opus" ? "ogg" : format;
}

function mapOutputFormat(format: string): string {
  if (format === "opus") return "ogg";
  if (format === "aac") return "adts";
  return format;
}

function buildFfmpegArgs(
  inputs: string[],
  output: string,
  options: JoinOptions,
  inputFormat: string,
  outputFormat: string,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error"];
  for (const input of inputs) {
    args.push("-f", inputFormat, "-i", input);
  }

  const filterParts: string[] = [];
  const normalizedLabels: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const label = `a${i}`;
    filterParts.push(
      `[${i}:a]aresample=${TARGET_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono[${label}]`,
    );
    normalizedLabels.push(`[${label}]`);
  }

  const crossfadeSec = (options.crossfadeMs / 1000).toFixed(4);
  filterParts.push(
    `${normalizedLabels.join("")}acrossfade=n=${inputs.length}:d=${crossfadeSec}:c1=tri:c2=tri[joined]`,
  );

  let mapLabel = "joined";
  if (options.trimSilence) {
    filterParts.push(`[joined]${silenceRemoveFilter()}[trimmed]`);
    mapLabel = "trimmed";
  }

  args.push(
    "-filter_complex", filterParts.join("; "),
    "-map", `[${mapLabel}]`,
    "-f", outputFormat,
    "-y", output,
  );

  return args;
}
