# Long-text chunking + crossfade

## Goal
긴 speech text가 provider hard limit을 초과해도 단일 출력 파일을 만들도록 한다.
Chunk 사이는 ffmpeg `acrossfade`로 이어 붙여 클릭/seam을 제거한다.
Adapter는 capability(정적 한계)만 선언하고, 정책(override, crossfade, dry-run)은 core에 둔다.

## Acceptance criteria
- [ ] ElevenLabs/OpenAI/Cartesia/Typecast actor로 5000자 초과 텍스트를 say하면 단일 파일이 나온다.
- [ ] 출력 파일 길이가 chunk 합 - (N-1) × crossfade와 일치한다 (오차 < 50ms).
- [ ] N=1 (텍스트가 hard limit 안)이면 기존과 동일한 single-shot path. 추가 ffmpeg 호출 없음.
- [ ] dry-run JSON은 N>1일 때 `chunks: [...]`와 `chunking: {...}` 메타를 추가한다. 기존 `request` 필드(첫 chunk 미리보기)는 유지 → backward-compat.
- [ ] ElevenLabs와 Typecast는 N>1일 때 `previous_text`/`next_text`를 자동 주입한다 (chunk index 기반).
- [ ] Edge-TTS와 Chatterbox는 capability를 선언하지 않는다 → 청킹 우회, 항상 single-shot.
- [ ] pcm/mulaw 같은 container-less 포맷은 청킹이 필요하면 명확한 에러로 거부한다.
- [ ] `tts say` / `tts run`에 `--max-chunk-chars`, `--crossfade-ms`, `--chunk-concurrency` 플래그 추가.
- [ ] actor.yaml `synthesis`에 `max_chunk_chars`, `crossfade_ms` 필드 추가.
- [ ] `--trim-silence`는 joined output에 한 번 적용 (chunk 별 적용 금지).
- [ ] script run의 atomic-rename staging이 chunked node에서도 깨지지 않는다.
- [ ] provider-keyed semaphore가 `runConcurrency × chunkConcurrency` 폭주를 막는다.
- [ ] 모든 변경에 대해 npm test / npm run lint / npm run build 통과.

## Working notes
- ffmpeg 명령 형태:
  ```
  ffmpeg -f mp3 -i c0.mp3 -f mp3 -i c1.mp3 ... \
    -filter_complex "[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a0]; ... ; [a0][a1]...acrossfade=n=N:d=0.05:c1=tri:c2=tri[joined]; [joined]silenceremove=...,areverse,silenceremove=...,areverse[final]" \
    -map "[final]" -f mp3 -y out.mp3
  ```
- N=1 path는 ffmpeg 우회 (chunk[0]을 그대로 write, trim만 기존 로직).
- Chunk context는 `request.context.chunk = { index, total, previousText?, nextText? }` 로 주입.
  - 기존 `providerOptions.previous_text` (Typecast) 는 단일-shot에선 유지, 청킹 시 context가 우선.
- Provider capability 초기값 (보수적):
  - ElevenLabs: hard 5000, soft 2500, supportsContext: true
  - OpenAI: hard 4096, soft 2000
  - Cartesia: hard 2500, soft 1500
  - Typecast: hard 3000, soft 1500, supportsContext: true
  - Edge-TTS: 미선언 (스트리밍, 사실상 무제한)
  - Chatterbox: 미선언 (로컬, 사용자 책임)
- 기본값: crossfade 50ms, chunk-concurrency 1. CLI/actor override 가능. hard limit 초과 요청은 거부.

## Slices (thin vertical, each ends green: test+lint+build)

- [x] **0. Verify ffmpeg 8.x supports `acrossfade=n=N`** — done; smoke test in /tmp passed.
- [x] **1. Splitter** — `src/core/chunk.ts` + 14 tests.
- [x] **2. Provider capabilities** — declared on EL/OpenAI/Cartesia/Typecast; Edge/Chatterbox unset; 6 tests.
- [x] **3. Policy resolver** — `src/core/chunk-policy.ts` + 9 tests.
- [x] **4. Chunk planner** — `src/core/chunk-plan.ts` + 2 tests under chunk-policy.
- [x] **5. Request context shape** — `ProviderSynthesisRequest.context.chunk`; ElevenLabs+Typecast wired; 3 tests.
- [x] **6. Audio joiner** — `src/core/join.ts` + 5 real-ffmpeg tests (sine inputs).
- [x] **7. executeSay integration** — chunked path in `core/say.ts` + 5 tests.
- [ ] **8. Provider semaphore** — DEFERRED. Defaults are 1×1; user opt-in fan-out is explicit. Add when actual rate-limit pain shows up.
- [x] **9. Run-script integration** — `core/run.ts` propagates chunk overrides + chunking metadata in manifest items. Atomic staging untouched.
- [x] **10. Dry-run JSON contract** — `chunks` + `chunking` fields added to `SayPreview` and `RunManifestItem`. Top-level `request` retained as first-chunk preview for back-compat. Verified via CLI smoke.
- [x] **11. CLI flags + actor.yaml fields** — `--max-chunk-chars` / `--crossfade-ms` / `--chunk-concurrency` on say/run; `synthesis.max_chunk_chars` / `crossfade_ms` / `chunk_concurrency` in actor.yaml.
- [x] **12. Docs + lessons** — `tasks/lessons.md` updated (this PR).

## Out of scope (don't drift)
- Streaming providers can be chunked: rejected (acoustic seams without cause).
- LLM-driven smart splitting: rejected (SOUL: speech text는 가공 안 함).
- Effects chain (pedalboard 류): rejected (SOUL: 공통 DSL 금지).
- Token-bucket / retry-after-aware rate limiter: YAGNI (semaphore로 충분).

## Verification story
- Each slice: `npm test` + targeted unit tests added.
- After all slices: `npm run lint` + `npm run build`.
- Manual end-to-end with real provider (`TTS_LIVE=1` smoke): one ElevenLabs say with 6000-char input → 단일 mp3, 듣기 자연스러움 (사람 확인 필요).
