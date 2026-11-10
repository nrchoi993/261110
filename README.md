# Responses Lab

Vanilla JavaScript와 Vite로 만든 OpenAI Responses API 교육용 챗봇입니다. 별도 백엔드나 Netlify 서버 함수 없이 브라우저의 `fetch`로 API를 직접 호출합니다. 외부 JavaScript 라이브러리와 CDN은 사용하지 않습니다.

## API 키와 실행 방법

1. 의존성을 설치합니다.

   ```sh
   npm install
   ```

2. 프로젝트 루트의 `.env.local`을 열고 `=` 뒤에 본인의 OpenAI API 키를 입력합니다. 파일은 빈 값으로 제공됩니다.

   ```dotenv
   VITE_OPENAI_API_KEY=
   ```

   GitHub에서 처음 내려받아 `.env.local`이 없다면 `.env.example`을 복사해 만드세요. 실제 키는 `.env.example`에 넣지 마세요.

3. 개발 서버를 실행하고 터미널에 표시된 로컬 주소를 엽니다.

   ```sh
   npm run dev
   ```

4. `.env.local`을 수정한 뒤에는 실행 중인 터미널에서 `Ctrl + C`로 개발 서버를 종료하고 `npm run dev`를 다시 실행합니다. 브라우저 새로고침만으로 환경 변수를 다시 읽는다고 가정하지 마세요.

Windows PowerShell에서 실행 정책 때문에 `npm.ps1`이 차단되면 `npm.cmd install`, `npm.cmd run dev`, `npm.cmd run build`, `npm.cmd test`를 사용하세요.

## 사용 방법과 상태

메시지를 입력하고 전송 버튼 또는 Enter로 질문합니다. Shift + Enter는 줄바꿈이며, 한국어 입력 조합을 확정하는 Enter는 전송하지 않습니다. 질문 예시를 누르면 입력창에 문구가 채워집니다.

| 화면 상태 | 의미 |
| --- | --- |
| 키 미설정 | `VITE_OPENAI_API_KEY`가 비어 있음. 전송할 수 없음 |
| 연결 미확인 | 키가 있지만 이 대화에서 실제 요청 결과를 아직 확인하지 않음 |
| 요청 중 | API 응답을 기다리는 중. 중복 전송 방지 |
| 요청 성공 | 실제 Responses API 요청으로 완료된 텍스트 또는 거절 응답을 받음 |
| 요청 실패 | 인증, 권한, 사용 한도, 네트워크, 응답 형식 등의 오류. 원인을 별도 표시 |

실패하면 질문을 입력창에 복원합니다. 실패한 요청은 다음 대화의 맥락에 추가하지 않습니다. 응답 대기는 60초 후 중단합니다.

대화 초기화는 화면과 요청 이력을 비우고 상태를 초기 상태로 되돌립니다. 응답 대기 중에도 초기화할 수 있으며 해당 요청을 취소합니다. 브라우저의 요청 취소는 OpenAI에서 이미 시작한 처리를 취소하거나 요금을 없애는 것을 보장하지 않습니다. 새로고침하면 대화도 사라집니다.

## 요청·응답 구조

사용 모델은 **`gpt-6-luna`**입니다. 2026-11-10에 확인한 공식 모델 문서에서 Responses API와 `reasoning.effort: "none"` 지원을 확인했습니다. 단순 대화 실습에서는 추론 강도를 `none`으로 설정합니다. 실제 사용 가능 여부는 계정과 프로젝트의 권한에 따라 달라질 수 있습니다. 모델명과 요청 코드는 `src/openai.js`에 있습니다.

`POST https://api.openai.com/v1/responses`에 `Authorization: Bearer <API 키>`와 `Content-Type: application/json` 헤더를 보냅니다. 요청 본문에는 아래 항목과 답변 지침인 `instructions`를 포함합니다.

```json
{
  "model": "gpt-6-luna",
  "reasoning": { "effort": "none" },
  "input": [{ "role": "user", "content": "안녕하세요" }],
  "max_output_tokens": 2048,
  "store": false
}
```

REST 응답은 `status`와 `output` 배열을 포함합니다. `output`에서 `type: "message"`, `role: "assistant"`인 항목을 찾고 그 `content`에서 `type: "output_text"`의 `text`를 모아 표시합니다. `refusal` 항목도 표시합니다. 첫 번째 항목이 항상 답변이라고 가정하지 않습니다. SDK의 `response.output_text`는 편의 속성이므로 REST JSON에서 바로 읽지 않습니다.

다음 질문에서는 `input`에 이전 사용자 메시지, 이전 응답의 원본 `output` 항목, 새 사용자 메시지를 순서대로 넣습니다. 이력은 현재 탭의 메모리에 보관합니다. `store: false`는 응답 객체를 나중에 조회하기 위한 저장을 끄며, 모든 종류의 데이터 보관을 없앤다는 의미는 아닙니다.

## 파일 구성

- `index.html`: 화면과 메시지용 HTML template, 모듈 진입점
- `src/style.css`: 모노톤 디자인과 반응형 스타일
- `src/main.js`: CSS import, 화면 상태, 입력 및 대화 이력 관리
- `src/openai.js`: Responses REST 요청, 응답 파싱과 오류 안내
- `.env.local`: 실제 키 입력 위치. Git 제외
- `.env.example`: 키를 비워 둔 환경 변수 작성 예시
- `AGENTS.md`: 향후 코드 작업 전에 확인할 프로젝트 작업 규칙

## 검증과 배포 주의

```sh
npm test
npm run build
```

테스트는 모의 `fetch` 응답을 사용하며 실제 OpenAI API를 호출하지 않습니다. 빌드 결과는 기본 `dist/`에 생성됩니다. 실제 키를 제공하지 않은 상태이므로 실서비스 인증 및 응답 성공 여부는 검증하지 않았습니다.

**`VITE_` 환경 변수는 API 키를 숨기지 못합니다.** Vite는 값을 클라이언트 코드에 포함하며, 브라우저 개발자 도구와 네트워크 요청에서도 키를 확인할 수 있습니다. `.gitignore`는 `.env.local`의 Git 업로드만 막으며 빌드된 JavaScript에 포함된 키를 보호하지 않습니다.

**실제 키가 포함된 소스나 `dist/` 결과물을 GitHub, Netlify 등의 공개 위치에 업로드·배포하면 안 됩니다.** 이 앱은 개인 로컬 학습용으로 사용하세요. 키가 노출되면 폐기하고 새 키를 발급하세요. Netlify 환경 변수에 `VITE_OPENAI_API_KEY`를 넣는 것 역시 브라우저 키 노출을 막지 못합니다.

Netlify 설정값은 Build command `npm run build`, Publish directory `dist`입니다. 공개 정적 화면 확인이 필요하면 실제 키 없이 빌드하세요. 키를 비워 둔 공개 화면에서는 챗봇 API 요청이 동작하지 않습니다.

## 참고한 OpenAI 공식 문서

- [Text generation — Responses API 호출 및 output 형식](https://developers.openai.com/api/docs/guides/text)
- [Conversation state — 대화 이력 직접 전달](https://developers.openai.com/api/docs/guides/conversation-state)
- [GPT-6 Luna — 모델, 추론 설정 및 지원 엔드포인트](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Error codes — 인증, 요청 제한과 서버 오류](https://developers.openai.com/api/docs/guides/error-codes)
