import { runFfmpeg, silenceRemoveFilter } from "./ffmpeg.js";

export async function trimSilence(
  audio: Uint8Array,
  format: string,
): Promise<Uint8Array> {
  const ffmpegFormat = mapToFfmpegFormat(format);
  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-f", ffmpegFormat,
    "-i", "pipe:0",
    "-af", silenceRemoveFilter(),
    "-f", ffmpegFormat,
    "pipe:1",
  ];

  return runFfmpeg(
    args,
    { failureCode: "FFMPEG_ERROR", failureLabel: "FFmpeg failed", maxBuffer: 100 * 1024 * 1024 },
    audio,
  );
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
