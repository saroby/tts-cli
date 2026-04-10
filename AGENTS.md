# Repository Guidelines

## Product Intent
제품 방향이 걸린 변경 전에는 [SOUL.md](/Users/louis/Code/tts-cli/SOUL.md)를 먼저 읽는다.
이 저장소의 핵심은 여러 TTS Provider를 하나의 CLI로 묶되, `actor`와 단순한 speech 입력을 중심에 두는 것이다.

## Architecture Rules
- `actor`를 1급 도메인으로 둔다. 단순 alias가 아니라 실행 설정 묶음이다.
- `provider`, `model`, `voice`는 `actor` 내부 속성이다.
- CLI는 가능한 한 `actor` 중심으로 동작하고, Provider 세부 옵션 노출은 보조 경로로 둔다.
- Provider별 차이는 adapter 계층으로 격리한다.
- speech text는 가능한 한 원문 문자열 그대로 보존한다.
- AI가 actor 정보를 읽고 Provider 문법을 대사에 넣더라도 CLI는 그 문자열을 해석하지 않고 그대로 전달한다.
- 공통 추상화로 담을 수 없는 기능은 adapter 전용 escape hatch로 처리하되, 도메인 모델을 오염시키지 않는다.

## Suggested Structure
- `src/cli`: 명령 파싱, 입출력, 사용자 UX
- `src/domain/actor`: actor 정의, 로딩, 검증
- `src/domain/script`: 대본 파싱, speech line
- `src/providers`: Provider adapter 구현
- `src/core/render`: speech -> Provider 요청 변환
- `fixtures/`: 샘플 actor, 샘플 script, golden output

## Coding Conventions
- TypeScript 우선. ESM 기준으로 작성한다.
- 타입 이름은 명확하게 쪼갠다. `Actor`, `SpeechNode`, `ProviderAdapter` 같이 둔다.
- Provider SDK 타입을 도메인 계층에 직접 새지 않게 한다.
- speech 본문은 불필요하게 쪼개지 말고 문자열로 유지한다.
- 새 기능을 넣을 때는 "이게 actor 레벨인지, script 구조 레벨인지, adapter 레벨인지"를 먼저 구분한다.

## Testing Guidelines
- 최소한 다음은 고정 테스트로 남긴다.
- actor 설정 파싱
- script speech line 파싱
- speech text 보존 규칙
- speech -> Provider별 렌더링 결과
- 가능한 경우 golden test로 Provider payload를 검증한다.

## Change Bar
- Provider 하나 추가할 때 기존 actor/script 모델이 흔들리면 구조를 다시 본다.
- ElevenLabs 기능을 넣더라도 연기 지시용 공통 DSL이 다시 생기면 실패다.
- 편의성보다 재현 가능성과 단순성을 우선한다.

## CLI Output Convention
- 이 CLI의 주 사용자는 AI다. 모든 데이터 출력은 **JSON을 기본**으로 한다.
- `--pretty` 플래그로 사람이 읽을 수 있는 포맷을 선택할 수 있다.
- 에러는 항상 `{"error":{"code":"...","message":"..."}}` 형태로 stderr에 출력한다.
- 에러 코드는 `src/shared/errors.ts`의 `ErrorCode` 타입에 정의한다.
- stdout은 데이터 전용, stderr는 에러 전용으로 분리한다.
- `tts say`에서 `--text`가 없으면 stdin에서 읽는다.

## Commands
- `npm run build` — TypeScript 빌드
- `npm test` — 전체 테스트
- `npm run test:live` — 실제 provider 호출 smoke test (TTS_LIVE=1 필요)
- `npm run dev` — tsx로 직접 실행
