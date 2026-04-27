import { execFile } from "node:child_process";

import { CliError } from "../shared/errors.js";
import type { ErrorCode } from "../shared/errors.js";

export const SILENCE_THRESHOLD_DB = -50;
export const SILENCE_DURATION_SEC = 0;

export function silenceRemoveFilter(): string {
  const threshold = `${SILENCE_THRESHOLD_DB}dB`;
  const stage = `silenceremove=start_periods=1:start_silence=${SILENCE_DURATION_SEC}:start_threshold=${threshold}`;
  return [stage, "areverse", stage, "areverse"].join(",");
}

export interface RunFfmpegOptions {
  failureCode: ErrorCode;
  failureLabel: string;
  // Defaults to 1 MB, sized for stderr-only invocations. Pass-through
  // pipelines (audio on stdout) must override based on expected output size.
  maxBuffer?: number;
}

const DEFAULT_MAX_BUFFER = 1024 * 1024;

export function runFfmpeg(
  args: string[],
  options: RunFfmpegOptions,
  stdin?: Uint8Array,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      args,
      { encoding: "buffer", maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          const isMissing =
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT";
          if (isMissing) {
            reject(new CliError(
              "FFmpeg is not installed or not on PATH. Install it from https://ffmpeg.org",
              1,
              { code: "FFMPEG_NOT_FOUND" },
            ));
            return;
          }
          const detail = stderr?.toString().trim() || error.message;
          reject(new CliError(`${options.failureLabel}: ${detail}`, 1, { code: options.failureCode }));
          return;
        }
        resolve(new Uint8Array(stdout));
      },
    );

    if (stdin !== undefined) {
      child.stdin!.write(stdin);
      child.stdin!.end();
    }
  });
}
