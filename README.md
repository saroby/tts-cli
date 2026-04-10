# tts-cli

Actor-centric multi-provider TTS CLI.

## Scope

- `actor` is the primary execution unit.
- `speech` text is preserved as-is.
- provider-specific acting syntax stays inside the speech string.
- provider-specific escape hatches stay in `provider_options`.

## Quick Start

```bash
npm install
npm run build
npm run lint
npm test
```

Create `actor.yaml`:

```yaml
version: 1
actors:
  narrator:
    provider: openai
    model: gpt-4o-mini-tts
    voice: alloy
```

Create `scene.tts`:

```text
narrator: The hallway was dark.
```

Preview:

```bash
npx tsx src/cli/index.ts say --actor narrator --text "Hello." --dry-run
npx tsx src/cli/index.ts run scene.tts --dry-run
```

Render:

```bash
npx tsx src/cli/index.ts say --actor narrator --text "Hello." --out out/hello.mp3
npx tsx src/cli/index.ts run scene.tts --out out/run
```

## Providers

- OpenAI
- ElevenLabs
- Cartesia
- Typecast
- Edge TTS
- Chatterbox

## Test Policy

- `npm test`
  - parser
  - actor loader/state
  - provider dry-run payloads
  - provider synthesize contract
  - run output/manifest integration

- `npm run lint`
  - TypeScript/ESM static lint
  - fails on warnings

- `npm run test:live`
  - opt-in real provider smoke test
  - requires matching provider credentials in env
  - optional filter: `TTS_LIVE_PROVIDERS=openai,elevenlabs`
  - optional text override: `TTS_LIVE_TEXT="short line"`

## Docs

- [docs/actor-format.md](docs/actor-format.md)
- [docs/script-dsl.md](docs/script-dsl.md)
- [docs/cli-usage.md](docs/cli-usage.md)
- [SOUL.md](SOUL.md)
