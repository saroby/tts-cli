import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import { CliError } from "../../shared/errors.js";
import { fileExists, readUtf8File } from "../../shared/fs.js";
import { hasOwn, isRecord } from "../../shared/object.js";
import { loadActorStates, resolveActorStatePath } from "./state.js";
import type {
  ActorDefinition,
  ActorRegistryLoadOptions,
  LoadedActorRegistry,
  RegistryDefaults,
  ResolvedActor,
  SynthesisOptions,
} from "./types.js";

const DEFAULT_REGISTRY_CANDIDATES = [
  "actor.yaml",
  "actors.yaml",
  "tts/actor.yaml",
];

export function getActorRegistryCandidates(cwd = process.cwd()): string[] {
  return [
    ...DEFAULT_REGISTRY_CANDIDATES.map((candidate) => resolve(cwd, candidate)),
    resolve(homedir(), ".config/tts-cli/actor.yaml"),
  ];
}

export async function loadActorRegistry(
  options: ActorRegistryLoadOptions = {},
): Promise<LoadedActorRegistry> {
  const sourcePath = await resolveActorRegistryPath(options);
  const source = await readUtf8File(sourcePath);

  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `Failed to parse actor registry: ${sourcePath}\n${details}`,
      1,
      { cause: error, code: "REGISTRY_PARSE_ERROR" },
    );
  }

  const actorStatePath = resolveActorStatePath(sourcePath, options);
  const actorStates = options.includeActorState
    ? (await loadActorStates(sourcePath, options)).actorStates
    : {};
  const registry = validateActorRegistry(document, sourcePath);

  return {
    ...registry,
    actorStatePath,
    actorStates,
  };
}

export async function resolveActorRegistryPath(
  options: ActorRegistryLoadOptions = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  if (options.actorFile) {
    const path = isAbsolute(options.actorFile)
      ? options.actorFile
      : resolve(cwd, options.actorFile);

    if (!(await fileExists(path))) {
      throw new CliError(`Actor registry not found: ${path}`, 2, { code: "REGISTRY_NOT_FOUND" });
    }

    return path;
  }

  for (const candidate of getActorRegistryCandidates(cwd)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new CliError(
    [
      "Actor registry not found.",
      "Searched:",
      ...getActorRegistryCandidates(cwd).map((candidate) => `  - ${candidate}`),
    ].join("\n"),
    2,
    { code: "REGISTRY_NOT_FOUND" },
  );
}

export function getActorOrThrow(
  registry: LoadedActorRegistry,
  actorName: string,
): ResolvedActor {
  const actor = registry.actors[actorName];
  if (!actor) {
    throw new CliError(`Actor not found: ${actorName}`, 2, { code: "ACTOR_NOT_FOUND" });
  }

  return actor;
}

function validateActorRegistry(
  value: unknown,
  sourcePath: string,
): Omit<LoadedActorRegistry, "actorStatePath" | "actorStates"> {
  if (!isRecord(value)) {
    throw new CliError(`Actor registry must be an object: ${sourcePath}`);
  }

  const version = value.version;
  if (version !== 1) {
    throw new CliError(
      `Unsupported actor registry version in ${sourcePath}: ${String(version)}`,
    );
  }

  const defaults = parseRegistryDefaults(value.defaults, sourcePath);
  const rawActors = value.actors;
  if (!isRecord(rawActors)) {
    throw new CliError(`"actors" must be an object in ${sourcePath}`);
  }

  const actors: Record<string, ResolvedActor> = {};

  for (const [name, rawActor] of Object.entries(rawActors)) {
    actors[name] = parseActorDefinition(name, rawActor, defaults, sourcePath);
  }

  return {
    version: 1,
    sourcePath,
    defaults,
    actors,
  };
}

function parseRegistryDefaults(
  value: unknown,
  sourcePath: string,
): RegistryDefaults {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new CliError(`"defaults" must be an object in ${sourcePath}`);
  }

  return {
    synthesis: parseSynthesisOptions(value.synthesis, `${sourcePath} defaults.synthesis`),
  };
}

function parseActorDefinition(
  name: string,
  value: unknown,
  defaults: RegistryDefaults,
  sourcePath: string,
): ResolvedActor {
  if (!isRecord(value)) {
    throw new CliError(`Actor "${name}" must be an object in ${sourcePath}`);
  }

  const provider = readRequiredString(value, "provider", `actor "${name}"`);
  const model = readRequiredString(value, "model", `actor "${name}"`);
  const voice = readRequiredString(value, "voice", `actor "${name}"`);
  const locale = readOptionalString(value, "locale");
  const providerOptions = parseProviderOptions(value, `actor "${name}"`);
  const actorSynthesis = parseSynthesisOptions(
    value.synthesis,
    `${sourcePath} actors.${name}.synthesis`,
  );

  const actor: ActorDefinition = {
    provider: provider.toLowerCase(),
    model,
    voice,
    locale,
    synthesis: mergeSynthesisOptions(defaults.synthesis, actorSynthesis),
    providerOptions,
  };

  return {
    name,
    sourcePath,
    ...actor,
  };
}

function parseProviderOptions(
  value: Record<string, unknown>,
  label: string,
): Record<string, unknown> | undefined {
  const raw =
    (hasOwn(value, "providerOptions") ? value.providerOptions : undefined) ??
    (hasOwn(value, "provider_options") ? value.provider_options : undefined);

  if (raw === undefined) {
    return undefined;
  }

  if (!isRecord(raw)) {
    throw new CliError(`"provider_options" must be an object in ${label}`);
  }

  return { ...raw };
}

function parseSynthesisOptions(
  value: unknown,
  label: string,
): SynthesisOptions | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new CliError(`"${label}" must be an object`);
  }

  const synthesis: SynthesisOptions = {};
  const speed = readOptionalNumber(value, "speed");
  const pitch = readOptionalNumber(value, "pitch");
  const volume = readOptionalNumber(value, "volume");
  const format = readOptionalString(value, "format");

  if (speed !== undefined) {
    synthesis.speed = speed;
  }

  if (pitch !== undefined) {
    synthesis.pitch = pitch;
  }

  if (volume !== undefined) {
    synthesis.volume = volume;
  }

  if (format !== undefined) {
    synthesis.format = format;
  }

  return Object.keys(synthesis).length > 0 ? synthesis : undefined;
}

function mergeSynthesisOptions(
  defaults?: SynthesisOptions,
  overrides?: SynthesisOptions,
): SynthesisOptions | undefined {
  if (!defaults && !overrides) {
    return undefined;
  }

  return {
    ...defaults,
    ...overrides,
  };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim() === "") {
    throw new CliError(`"${key}" must be a non-empty string in ${label}`);
  }

  return field;
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "string") {
    throw new CliError(`"${key}" must be a string`);
  }

  return field;
}

function readOptionalNumber(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "number" || Number.isNaN(field)) {
    throw new CliError(`"${key}" must be a number`);
  }

  return field;
}
