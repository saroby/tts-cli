import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { CliError } from "../shared/errors.js";

const RAW_PREVIEW_FORMATS = new Set(["pcm", "ulaw", "mulaw", "mu-law"]);

export function assertPreviewPlaybackSupported(format: string): void {
  const normalized = format.trim().toLowerCase();

  if (RAW_PREVIEW_FORMATS.has(normalized)) {
    throw new CliError(
      `Audio preview does not support raw ${normalized} output. Use --format mp3, wav, aac, opus, or flac.`,
      1,
      { code: "FORMAT_UNSUPPORTED" },
    );
  }
}

export async function playAudio(
  audio: Uint8Array,
  format: string,
): Promise<void> {
  assertPreviewPlaybackSupported(format);
  const tmpPath = join(tmpdir(), `tts-preview-${Date.now()}.${format}`);
  await writeFile(tmpPath, audio);

  try {
    await execPlayer(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function execPlayer(filePath: string): Promise<void> {
  const player = process.platform === "darwin" ? "afplay" : "ffplay";
  const args =
    player === "ffplay"
      ? ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath]
      : [filePath];

  return new Promise((resolve, reject) => {
    execFile(player, args, (error) => {
      if (error) {
        reject(new Error(`Audio playback failed (${player}): ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}
