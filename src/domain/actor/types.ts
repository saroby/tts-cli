export interface ActorRegistry {
  version: 1;
  defaults?: RegistryDefaults;
  actors: Record<string, ActorDefinition>;
}

export interface ActorCatalogState {
  hidden?: boolean;
  reason?: string;
}

export interface ActorStateFile {
  version: 1;
  actors: Record<string, ActorCatalogState>;
}

export interface ActorRegistryLoadOptions {
  actorFile?: string;
  actorStateFile?: string;
  cwd?: string;
  includeActorState?: boolean;
}

export interface RegistryDefaults {
  synthesis?: SynthesisOptions;
}

export interface ActorDefinition {
  provider: string;
  model: string;
  voice: string;
  locale?: string;
  synthesis?: SynthesisOptions;
  providerOptions?: Record<string, unknown>;
}

export interface SynthesisOptions {
  speed?: number;
  pitch?: number;
  volume?: number;
  format?: string;
}

export interface LoadedActorRegistry {
  version: 1;
  sourcePath: string;
  actorStatePath: string;
  defaults: RegistryDefaults;
  actors: Record<string, ResolvedActor>;
  actorStates: Record<string, ActorCatalogState>;
}

export interface ResolvedActor extends ActorDefinition {
  name: string;
  sourcePath: string;
}
