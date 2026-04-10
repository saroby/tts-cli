import { writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { CliError } from "../../shared/errors.js";
import { ensureParentDirectory, fileExists, readUtf8File } from "../../shared/fs.js";
import { hasOwn, isRecord } from "../../shared/object.js";
import type {
  ActorCatalogState,
  ActorRegistryLoadOptions,
} from "./types.js";

const DEFAULT_ACTOR_STATE_FILE = "actor-state.yaml";

export async function loadActorStates(
  registrySourcePath: string,
  options: ActorRegistryLoadOptions = {},
): Promise<{
  actorStatePath: string;
  actorStates: Record<string, ActorCatalogState>;
}> {
  const actorStatePath = resolveActorStatePath(registrySourcePath, options);
  if (!(await fileExists(actorStatePath))) {
    return {
      actorStatePath,
      actorStates: {},
    };
  }

  const source = await readUtf8File(actorStatePath);

  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `Failed to parse actor state file: ${actorStatePath}\n${details}`,
      1,
      { cause: error },
    );
  }

  return {
    actorStatePath,
    actorStates: validateActorStates(document, actorStatePath),
  };
}

export async function saveActorStates(
  actorStatePath: string,
  actorStates: Record<string, ActorCatalogState>,
): Promise<void> {
  const normalizedActors = normalizeActorStates(actorStates);
  const document = stringifyYaml({
    version: 1,
    actors: normalizedActors,
  });

  await ensureParentDirectory(actorStatePath);
  await writeFile(actorStatePath, document, "utf8");
}

export function setActorHiddenState(
  actorStates: Record<string, ActorCatalogState>,
  actorName: string,
  hidden: boolean,
  reason?: string,
): Record<string, ActorCatalogState> {
  const nextStates = { ...actorStates };

  if (!hidden) {
    delete nextStates[actorName];
    return nextStates;
  }

  nextStates[actorName] = normalizeActorState({
    ...nextStates[actorName],
    hidden: true,
    reason,
  });

  return nextStates;
}

export function isActorHidden(
  actorStates: Record<string, ActorCatalogState>,
  actorName: string,
): boolean {
  return actorStates[actorName]?.hidden === true;
}

export function resolveActorStatePath(
  registrySourcePath: string,
  options: ActorRegistryLoadOptions,
): string {
  if (options.actorStateFile) {
    if (isAbsolute(options.actorStateFile)) {
      return options.actorStateFile;
    }

    return resolve(options.cwd ?? process.cwd(), options.actorStateFile);
  }

  return resolve(dirname(registrySourcePath), DEFAULT_ACTOR_STATE_FILE);
}

function validateActorStates(
  value: unknown,
  sourcePath: string,
): Record<string, ActorCatalogState> {
  if (!isRecord(value)) {
    throw new CliError(`Actor state file must be an object: ${sourcePath}`);
  }

  if (value.version !== 1) {
    throw new CliError(
      `Unsupported actor state file version in ${sourcePath}: ${String(value.version)}`,
    );
  }

  if (!hasOwn(value, "actors")) {
    return {};
  }

  if (!isRecord(value.actors)) {
    throw new CliError(`"actors" must be an object in ${sourcePath}`);
  }

  const actorStates: Record<string, ActorCatalogState> = {};
  for (const [actorName, rawState] of Object.entries(value.actors)) {
    actorStates[actorName] = parseActorState(rawState, sourcePath, actorName);
  }

  return normalizeActorStates(actorStates);
}

function parseActorState(
  value: unknown,
  sourcePath: string,
  actorName: string,
): ActorCatalogState {
  if (!isRecord(value)) {
    throw new CliError(`Actor state for "${actorName}" must be an object in ${sourcePath}`);
  }

  const hidden = readOptionalBoolean(value, "hidden", sourcePath, actorName);
  const reason = readOptionalString(value, "reason", sourcePath, actorName);

  return normalizeActorState({
    hidden,
    reason,
  });
}

function normalizeActorStates(
  actorStates: Record<string, ActorCatalogState>,
): Record<string, ActorCatalogState> {
  return Object.fromEntries(
    Object.entries(actorStates)
      .map(([actorName, actorState]) => [actorName, normalizeActorState(actorState)] as const)
      .filter(([, actorState]) => Object.keys(actorState).length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeActorState(actorState: ActorCatalogState): ActorCatalogState {
  const normalized: ActorCatalogState = {};

  if (actorState.hidden === true) {
    normalized.hidden = true;
  }

  if (typeof actorState.reason === "string" && actorState.reason.trim() !== "") {
    normalized.reason = actorState.reason.trim();
  }

  return normalized;
}

function readOptionalBoolean(
  value: Record<string, unknown>,
  key: string,
  sourcePath: string,
  actorName: string,
): boolean | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "boolean") {
    throw new CliError(`"${key}" must be a boolean in ${sourcePath} actors.${actorName}`);
  }

  return field;
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
  sourcePath: string,
  actorName: string,
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "string") {
    throw new CliError(`"${key}" must be a string in ${sourcePath} actors.${actorName}`);
  }

  return field;
}
