# SOUL

## 존재 이유
`tts-cli`는 여러 TTS Provider를 하나의 CLI로 다루기 위한 도구다.
Provider마다 다른 API, 모델, 보이스를 숨기고, 일관된 작업 흐름으로 TTS를 만든다.

## 핵심 개념
- `actor`는 `provider + model + voice + defaults`를 묶은 실행 단위다.
- 사용자는 매번 Provider 세부사항을 고르지 않고, `actor`를 선택해 바로 합성해야 한다.
- 스크립트는 단순해야 하고, 대사 본문은 actor/provider에 맞는 문자열을 그대로 둘 수 있어야 한다.

## 우리가 만드는 경험
- 같은 대사 흐름을 여러 Provider로 쉽게 바꿔 돌릴 수 있어야 한다.
- 캐릭터/화자 단위 설정은 `actor`로 재사용 가능해야 한다.
- AI에게 actor 정보를 먼저 주고, 그 actor에 맞는 대사를 바로 쓰게 할 수 있어야 한다.
- Provider 고유 기능은 살리되, 현재 스펙은 TTS 중심으로 단순해야 한다.
- 배치 실행, 재현 가능성, 디버깅 가능성이 좋아야 한다.

## 중요한 원칙
- 추상화는 `provider`가 아니라 `의미` 중심이어야 한다.
- `actor`는 1급 개념이어야 한다. 보이스 선택보다 더 상위 개념이다.
- 대본의 공통 추상화는 `speech`까지만 둔다.
- 대사 본문 안의 연기 표현은 별도 DSL로 만들지 않는다.
- actor가 ElevenLabs라면 대사 안에 ElevenLabs 문법을 직접 쓸 수 있다.
- pause와 SFX는 현재 스펙에서 제외한다.
- Provider 고유 기능이 공통 추상화에 안 맞아도, escape hatch는 남겨둔다.

## ElevenLabs 표현 기준
- `(whispers)`, `(sarcastic)` 같은 표현은 ElevenLabs actor의 대사 본문에 그대로 둔다.
- CLI는 이 표현을 별도 문법으로 해석하거나 가공하지 않는다.
- 즉, `mina: (whispers) Keep your voice down.` 는 그냥 speech text다.
- 효과음과 무음 구간은 현재 다루지 않는다.

## 제품의 기준
좋은 변경은 다음을 만든다.
- 같은 대사 흐름이 Provider를 바꿔도 크게 깨지지 않는다.
- `actor` 관리가 쉬워진다.
- 최소 공통 입력과 Provider 종속 텍스트의 경계가 명확하다.
- Provider 특화 기능이 전체 구조를 오염시키지 않는다.

## 한 문장 정의
`tts-cli`는 여러 TTS Provider를 `actor`와 단순한 speech 입력으로 묶고, 필요한 경우 provider별 대사 표현을 그대로 허용하는 재현 가능한 음성 합성 CLI다.
