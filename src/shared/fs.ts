import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readUtf8File(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await ensureParentDirectory(path);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
