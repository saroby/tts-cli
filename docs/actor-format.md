# Actor Format

`actor.yaml` is a registry of reusable speaking presets.

## Shape

```yaml
version: 1
defaults:
  synthesis:
    speed: 1.0
actors:
  actor_name:
    provider: elevenlabs
    model: eleven_v3
    voice: ZJCNdZEjYwkOElxugmW2
```

## Discovery

By default, CLI should discover the registry in this order:

- `./actor.yaml`
- `./actors.yaml`
- `./tts/actor.yaml`
- `~/.config/tts-cli/actor.yaml`

Use `--actor-file` only when a different registry source should be used.

## Required fields

- `version`: schema version
- `actors`: actor map
- `provider`: target provider name
- `model`: provider model id
- `voice`: provider voice id or name

## Optional fields

- YAML keys use `snake_case`. Loaded domain objects may use `camelCase`.
- `--actor-file` replaces the auto-discovered registry. It does not merge files.
- `locale`: BCP-47 language tag
- `synthesis`: provider-agnostic defaults like `speed`, `pitch`, `volume`, `format`, `max_chunk_chars`, `crossfade_ms`, `chunk_concurrency`
- `provider_options`: raw provider-specific escape hatch

## Credentials policy

- API keys and provider credentials do not belong in `actor.yaml`.
- Provider authentication is loaded from environment variables only.
- `actor.yaml` stores execution settings only.

## Acting text policy

- Inline acting syntax is not configured here.
- If an actor uses ElevenLabs, the speech text may contain ElevenLabs-style parentheses directly.
- The CLI should not read this file and invent a separate acting DSL from it.

## Current decisions

- `actor` is the primary unit for CLI execution.
- Registry format is YAML because readability for direct editing matters more than stricter config syntax.
- Registry loading is automatic by default.
- `--actor-file` selects a different registry source. It does not merge files.
- The registry stores execution settings, not inline acting syntax rules.
- Provider credentials are loaded from environment variables only.
- Provider flags should usually be derived from the selected actor.
- `provider_options` is allowed, but it is not the main API.
