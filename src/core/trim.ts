import { execFile } from "node:child_process";
import { CliError } from "../shared/errors.js";

const SILENCE_THRESHOLD_DB = -50;
const SILENCE_DURATION_SEC = 0;

/**
 * Trim leading and trailing silence from audio using FFmpeg's silenceremove filter.
 * Pipes audio through stdin/stdout — no temp files needed.
 */
export async function trimSilence(
  audio: Uint8Array,
  format: string,
): Promise<Uint8Array> {
  const threshold = `${SILENCE_THRESHOLD_DB}dB`;
  const filter = [
    `silenceremove=start_periods=1:start_silence=${SILENCE_DURATION_SEC}:start_threshold=${threshold}`,
    "areverse",
    `silenceremove=start_periods=1:start_silence=${SILENCE_DURATION_SEC}:start_threshold=${threshold}`,
    "areverse",
  ].join(",");

  const ffmpegFormat = mapToFfmpegFormat(format);

  return new Promise<Uint8Array>((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-f", ffmpegFormat,
        "-i", "pipe:0",
        "-af", filter,
        "-f", ffmpegFormat,
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 100 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          const code = isEnoent(error) ? "FFMPEG_NOT_FOUND" : "FFMPEG_ERROR";
          const message = code === "FFMPEG_NOT_FOUND"
            ? "FFmpeg is not installed or not on PATH. Install it from https://ffmpeg.org"
            : `FFmpeg failed: ${error.message}`;
          reject(new CliError(message, 1, { code }));
          return;
        }
        resolve(new Uint8Array(stdout));
      },
    );

    child.stdin!.write(audio);
    child.stdin!.end();
  });
}

function mapToFfmpegFormat(format: string): string {
  switch (format.toLowerCase()) {
    case "mp3": return "mp3";
    case "wav": return "wav";
    case "aac": return "adts";
    case "opus": return "ogg";
    case "flac": return "flac";
    case "pcm": return "s16le";
    case "mulaw":
    case "mu-law":
    case "ulaw": return "mulaw";
    default: return format;
  }
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
