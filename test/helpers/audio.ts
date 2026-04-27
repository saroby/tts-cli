import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function generateSineMp3(
  freq: number,
  durationSec: number,
  sampleRate = 44100,
): Promise<Uint8Array> {
  return withTempDir("tts-cli-sine", async (dir) => {
    const out = join(dir, "s.mp3");
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `sine=frequency=${freq}:duration=${durationSec}`,
      "-ac", "1",
      "-ar", String(sampleRate),
      "-b:a", "128k",
      "-y",
      out,
    ]);
    return new Uint8Array(await readFile(out));
  });
}

export async function probeDurationSec(bytes: Uint8Array, format: string): Promise<number> {
  return withTempDir("tts-cli-probe", async (dir) => {
    const file = join(dir, `audio.${format}`);
    await writeFile(file, bytes);
    const { stdout } = await execFile("ffprobe", [
      "-hide_banner", "-loglevel", "error",
      "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1",
      file,
    ]);
    return Number.parseFloat(stdout.toString().trim());
  });
}

export async function probeFileDurationSec(file: string): Promise<number> {
  const { stdout } = await execFile("ffprobe", [
    "-hide_banner", "-loglevel", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ]);
  return Number.parseFloat(stdout.toString().trim());
}
