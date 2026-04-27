# @saroby/tts-cli

Actor-centric multi-provider TTS CLI.

Install:

```bash
npm install -g @saroby/tts-cli
```

## Scope

- `actor` is the primary execution unit.
- `speech` text is preserved as-is.
- provider-specific acting syntax stays inside the speech string.
- provider-specific escape hatches stay in `provider_options`.

## Quick Start

```bash
npm install
npm run setup:chatterbox   # only if you want the Chatterbox provider
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

## Long-text chunking

긴 대사가 provider hard limit (ElevenLabs 5000자, OpenAI 4096자 등)을 넘으면 자동으로 문장 경계에서 청크 분할 후 ffmpeg `acrossfade`로 이어 붙여 단일 파일을 만든다.

- 청킹 가능 provider: OpenAI, ElevenLabs, Cartesia, Typecast (각자 hard limit과 권장 soft target을 자체 선언).
- 청킹 우회: Edge TTS (스트리밍), Chatterbox (로컬).
- ElevenLabs / Typecast는 청크별 `previous_text` / `next_text`를 자동 주입해 prosody 연속성을 유지한다.
- ElevenLabs 본문의 `(whispers)` 같은 paren tag와 `[laugh]` 같은 bracket tag는 청크 경계에서 절대 분할되지 않는다.
- `pcm` / `mulaw` 같은 container-less 포맷은 청킹 대상이 아니다 (명확한 에러).

CLI 플래그:

```bash
tts say --actor mina --text "<long text>" --out out.mp3 \
  --max-chunk-chars 2000 --crossfade-ms 80 --chunk-concurrency 1
```

actor.yaml에서 actor별로 고정할 수도 있다:

```yaml
actors:
  mina:
    provider: elevenlabs
    model: eleven_v3
    voice: ZJCNdZEjYwkOElxugmW2
    synthesis:
      max_chunk_chars: 2000
      crossfade_ms: 80
      chunk_concurrency: 1
```

dry-run 시 텍스트가 청킹되면 응답 JSON에 `chunking` 메타와 `chunks` 배열(청크별 request preview)이 추가된다. 짧은 텍스트면 두 필드는 생략되어 기존 응답과 호환된다.

## Optional Runtime Setup

Chatterbox needs a separate Python runtime with `torch`, `torchaudio`, and `chatterbox-tts`.

```bash
npm run setup:chatterbox
```

Preview the exact commands first:

```bash
node --import tsx src/cli/index.ts setup chatterbox --dry-run
```

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
