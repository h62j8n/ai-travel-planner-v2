# AI 여행 플래너 v2 — 프로젝트 규칙

## 프로젝트 개요

목적지/기간/예산/취향을 입력하면 AI가 일자별 여행 동선을 생성하고, 사용자가 드래그로 일부만 수정하면 그 의도를 반영해 나머지 일정은 그대로 유지한 채 재조정하는 서비스.

## 기술 스택

- Frontend: React + Vite + MUI, 드래그앤드롭 dnd-kit, 폼 react-hook-form + zod
- Backend: NestJS + TypeORM + Supabase(Postgres), 인증 passport-jwt + bcrypt, 문서화 @nestjs/swagger
- AI: Gemini API, 지오코딩 OpenStreetMap Nominatim
- 배포: 프론트 Vercel, 백엔드 Render

## 이번 스프린트 비목표 (구현하지 않음)

- CI/CD, 자동화 테스트 스위트, BullMQ/Redis
- 소셜 로그인, 비밀번호 재설정, 이메일 인증, 다국어
- 실시간 예약/결제/협업 기능

## 핵심 불변 규칙

- 부분 재조정 시 변경 요청한 day 외 나머지 day의 activities는 절대 수정하지 않는다 — 이 서비스의 핵심 차별점이므로 프롬프트 설계와 응답 검증 로직 양쪽에서 이중으로 강제한다.
- JWT는 sessionStorage에 저장한다 (localStorage 아님). 로그아웃 시 비운다.
- ai_response_cache는 최초 일정 생성에만 적용한다. 재조정 요청에는 캐시를 적용하지 않는다.
- route_warning(flagged, reason)은 관리자 전용으로 숨기지 않고 사용자 화면에도 즉시 노출한다.
- flagged=true인 day라도 활동 순서는 사용자가 정한 그대로 유지한다 — 자동으로 재배열하지 않는다.
- 관리자 API(GET /admin/\*)는 role=admin이 아닌 경우 403을 반환하고, 프론트는 그에 맞는 리다이렉트/안내 UX를 제공한다.
- **보안 — .env 키값 절대 입력 금지**: .env 파일의 모든 민감한 정보(Supabase ANON_KEY, SECRET_KEY, Gemini API 키, JWT 시크릿, DB 비밀번호 등)는 프롬프트·작업·코드 리뷰에 입력하지 않는다. 대신 placeholder(`[YOUR_GEMINI_API_KEY]`, `[SUPABASE_SECRET_KEY]` 등)로 대체한다. 작업 중 .env를 열어야 하면 로컬에서만 참조하고 대화에 공유하지 않는다. 실수로 노출되면 즉시 해당 키를 재생성한다.

## 비용 제약

- 실비용 총 $10 이내. 저비용 모델/토큰 절약형 프롬프트를 우선한다.
- Gemini API 무료 티어 한도는 Phase 2 착수 전 반드시 확인한다.

## 작업 전 필수 참조 문서

- `PRD_AI여행플래너_v2.1.md` — 기능 요구사항, API 계약, 데이터 스펙, 엣지케이스, DoD
- `ERD_AI여행플래너.md` — 테이블 스키마
- `WBS_AI여행플래너.md` — Phase별 산출물과 완료 기준
- `wireframe/*.html` — 화면 작업 시 레이아웃 1차 근거

## 서브에이전트

역할별 세부 규칙은 각 에이전트 파일이 우선한다. 아래 규칙과 상충하면 이 파일의 공통 규칙을 따른다.

- `ai-specialist` — 프롬프트 설계, AI 응답 파싱/검증, 동선 판정, 캐싱
- `backend-developer` — NestJS API, 엔티티, 인증/가드
- `frontend-developer` — React 화면, 드래그앤드롭, 폼
- `qa-engineer` — 기능 검증, DoD 체크 (코드 수정 없음)

Phase별 작업 배분은 사용자가 직접 지시한다.

## QA 프로세스

- 각 Phase 구현 위임이 끝나면 반드시 qa-engineer를 호출해 WBS의 "완료 기준"을 pass/fail로 검증한다.
- fail이면 다음 Phase로 넘어가지 않고 담당 에이전트에 재작업을 위임한다.
- 버그 발견 시 qa-engineer는 코드를 직접 수정하지 않고 재현 절차·기대 결과·실제 결과를 구조화해 보고한다.
