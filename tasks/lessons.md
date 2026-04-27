# Lessons

## 2026-04-13
- Failure mode: interactive UI state let a zero-result filter drive `cursor` negative, and preview playback assumed every audio format was self-describing.
- Detection signal: PR review identified a reproducible `/<no-match>` -> Down -> clear filter -> Enter crash path and raw `pcm`/`ulaw` preview failures.
- Prevention rule: when adding interactive navigation, clamp indexes through a shared helper for every movement/filter path; when adding preview/playback features, explicitly gate raw/containerless formats unless decoder metadata is wired end-to-end.

## 2026-04-27
- Failure mode (architectural): first-pass design wanted to put chunking *policy* (limits, crossfade defaults, dry-run formatting) directly on `ProviderAdapter`, and to inject per-chunk `previous_text`/`next_text` via the static `providerOptions` bag.
- Detection signal: codex review flagged that adapters would have to grow new logic every time policy gained a knob (overrides, CLI flags, dry-run shape), and that `providerOptions` is the *static actor config* — not a per-call mailbox — so reusing it for dynamic chunk metadata blurs caching/serialization assumptions.
- Prevention rule: split adapter-level *capability declaration* (static facts: `textLimit`, `chunkableFormats`, `context.previousNextText`) from core-level *policy resolution* (per-call decisions: softTarget, crossfadeMs, concurrency). Per-call dynamic data lives on `ProviderSynthesisRequest.context`, never on `actor.providerOptions`. Adapters opt into context by reading `request.context?.chunk` and overriding any matching static option.
- Bonus rule: when joining N encoded-audio chunks via ffmpeg, normalize each input with `aresample`/`aformat` *per input* (not as one combined filter), then use `acrossfade=n=N` (single re-encode). `amerge` is for simultaneous streams, not sequential speech — easy to grab by mistake.
