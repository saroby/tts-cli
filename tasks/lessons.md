# Lessons

## 2026-04-13
- Failure mode: interactive UI state let a zero-result filter drive `cursor` negative, and preview playback assumed every audio format was self-describing.
- Detection signal: PR review identified a reproducible `/<no-match>` -> Down -> clear filter -> Enter crash path and raw `pcm`/`ulaw` preview failures.
- Prevention rule: when adding interactive navigation, clamp indexes through a shared helper for every movement/filter path; when adding preview/playback features, explicitly gate raw/containerless formats unless decoder metadata is wired end-to-end.
