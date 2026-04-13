# CLI Usage

아직 구현 전이다.
아래는 이 저장소가 목표로 하는 CLI UX 예시다.

## Registry discovery

기본적으로 CLI는 actor registry를 자동 탐색한다.

- `./actor.yaml`
- `./actors.yaml`
- `./tts/actor.yaml`
- `~/.config/tts-cli/actor.yaml`

직접 지정이 필요할 때만 `--actor-file`을 쓴다.
이 옵션을 주면 자동 탐색은 건너뛰고, 지정한 파일 하나만 registry로 사용한다.

## 1. actor 목록 보기

```bash
tts actor list
```

예상 출력:

```text
Available actors

  narrator  openai      gpt-4o-mini-tts  alloy
  mina      elevenlabs  eleven_v3        ZJCNdZEjYwkOElxugmW2
  james     cartesia    sonic-2          calm_british_male
```

JSON으로도 볼 수 있다.

```bash
tts actor list --json
```

## 2. actor 상세 보기

```bash
tts actor show mina
```

예상 출력:

```text
name: mina
provider: elevenlabs
model: eleven_v3
voice: ZJCNdZEjYwkOElxugmW2
locale: ko-KR
```

용도:
- 사람이 actor 특성을 확인한다.
- AI 프롬프트에 이 actor 정보를 넣는다.
- Provider가 ElevenLabs라는 걸 알면 대사 안에 ElevenLabs 문법을 직접 쓸 수 있다.

파일을 직접 지정해야 하면:

```bash
tts actor show mina --actor-file examples/actor.yaml
```

## 3. 한 줄 바로 합성

```bash
tts say \
  --actor mina \
  --text "안녕하세요. 오늘도 시작해볼까요?" \
  --out out/mina.mp3
```

## 3.5. Chatterbox 런타임 준비

Chatterbox는 Python 런타임이 별도로 필요하다.

```bash
tts setup chatterbox
```

실행 없이 계획만 보려면:

```bash
tts setup chatterbox --dry-run
```

## 4. actor 정보를 보고 대사 작성

```bash
tts say \
  --actor mina \
  --text "(whispers) 조용히 말해. 누가 듣고 있어." \
  --out out/whisper.mp3
```

의미:
- speech text는 그대로 보존된다.
- actor가 ElevenLabs면 ElevenLabs 문법을 대사 안에 직접 쓸 수 있다.
- CLI는 이 문자열을 별도 문법으로 해석하지 않는다.

## 4.5. 무음 제거

합성된 오디오의 앞뒤 무음을 잘라낸다. FFmpeg가 설치되어 있어야 한다.

```bash
tts say \
  --actor mina \
  --text "안녕하세요." \
  --out out/mina.mp3 \
  --trim-silence
```

`run`에서도 동일하게 쓸 수 있다.

```bash
tts run \
  examples/demo.tts \
  --out out/demo \
  --trim-silence
```

## 5. 파일 실행

```bash
tts run \
  examples/demo.tts \
  --out out/demo
```

예상 결과:

```text
out/demo/
  0001-narrator.mp3
  0002-mina.mp3
  0003-james.mp3
  manifest.json
```

규칙:
- `say`의 `--out`은 파일 경로다.
- `run`의 `--out`은 디렉터리 경로다.
- 한 `speech line`이 파일 하나가 된다.
- 파일명 앞 숫자는 실행 순서를 뜻한다.
- 기본 출력 포맷은 `mp3`다.

## 6. `run` 결과 manifest 예시

```json
{
  "source": "examples/demo.tts",
  "items": [
    {
      "index": 1,
      "actor": "narrator",
      "provider": "openai",
      "voice": "alloy",
      "text": "The hallway was dark.",
      "file": "0001-narrator.mp3",
      "status": "ok"
    }
  ]
}
```

## 7. 실행 전 구조 확인

```bash
tts run \
  examples/demo.tts \
  --dry-run \
  --json
```

예상 출력 일부:

```json
{
  "actor": "mina",
  "provider": "elevenlabs",
  "text": "(whispers) Did you hear that?"
}
```

용도:
- speech line 구조가 제대로 나왔는지 확인
- speech 원문이 손상되지 않았는지 확인
- adapter 버그 디버깅

## 8. 현재 스펙에서 제외

- `@lang ...`
- `@scene ...`
- `[pause ...]`
- `[sfx ...]`
- 무음 파일 생성
- 효과음 asset 연결

## 9. 다른 actor registry 사용

```bash
tts say \
  --actor-file examples/actor.yaml \
  --actor mina \
  --voice custom_voice_id \
  --text "이건 임시 보이스 테스트입니다." \
  --out out/test.mp3
```

원칙:
- 기본은 actor 사용
- `--actor-file`은 지정한 파일 하나만 사용한다
- 테스트나 fixture 전환이 필요할 때만 쓴다

## 10. ElevenLabs 문법 그대로 쓰기

```bash
tts say \
  --actor mina \
  --text "(whispers) Keep your voice down." \
  --out out/mina-whisper.mp3
```

이 문자열은 별도 문법으로 변환되지 않고 그대로 provider 요청에 들어간다.
