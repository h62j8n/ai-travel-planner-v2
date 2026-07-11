# AI 여행 일정 플래너 — WBS (Work Breakdown Structure)

- 작성일: 2026-07-08 (최종 수정: 2026-07-11)
- 관련 문서: PRD_AI여행플래너.md(v2.3), ERD_AI여행플래너.md(v1.1), 5W1H_AI여행플래너.md
- 전체 기간: 10일 (PRD 14절 기준, 활동시간/동반인/취향enum 추가로 Phase 2 연장, 버퍼 제거), 실비용 $10 이내

## 전체 개요

| Phase | 기간 | 내용 | PRD 근거 |
|---|---|---|---|
| 1. 프로젝트 셋업 | Day 1-2 | 환경설정, DB 스키마, 인증 | 6.1, ERD |
| 2. 일정 생성 | Day 3-5 | 생성 폼(활동시간/동반인/취향), AI 연동, 캐시 | 6.2, 6.8 |
| 3. 드래그 재조정 + 동선 판정 | Day 6-8 | 핵심 기능, 최대 시간 배정 | 6.3, 6.5 |
| 4. 저장/목록/관리자 | Day 9 | 목록, 관리자 화면 3개 | 6.4, 6.6 |
| 5. 문서화/배포 | Day 10 | Swagger, 배포, 엣지케이스, QA 간략화 | 6.7, 10, 13 |

---

## Phase 1. 프로젝트 셋업 (Day 1-2)

| WBS# | 작업 | 산출물 | 스택 |
|---|---|---|---|
| 1.1 | 프론트엔드 프로젝트 초기화 | Vite+React 프로젝트, MUI 테마 설정 | React, Vite, MUI |
| 1.2 | 백엔드 프로젝트 초기화 | NestJS 프로젝트, 모듈 구조 설계 | NestJS |
| 1.3 | Supabase 프로젝트 생성 및 스키마 반영 | users/trips/prompt_templates/ai_response_cache 등 테이블 | Supabase, ERD 참고 |
| 1.4 | TypeORM 연동 | Entity 정의, Supabase Postgres 연결 | TypeORM, pg |
| 1.5 | 회원가입/로그인/로그아웃 구현 | POST /auth/signup, /login, /logout | passport-jwt, bcrypt |
| 1.6 | 역할 기반 인가(Guard) | user/admin 라우트 가드, 403 처리 | NestJS Guard |

**완료 기준**: 회원가입→로그인→JWT 발급→인증 필요 API 접근까지 동작

---

## Phase 2. 일정 생성 기능 (Day 3-5)

| WBS# | 작업 | 산출물 | 스택 |
|---|---|---|---|
| 2.1 | 일정 생성 폼 UI | 목적지/기간/예산/활동시간/동반인/취향 입력 폼 | react-hook-form, zod |
| 2.2 | Gemini API 연동 | 프롬프트 설계, 일자별 동선 생성 로직 | Gemini API |
| 2.3 | AI 응답 파싱/검증 | 8.3 출력 스키마 파싱, 실패 시 1회 재시도 | - |
| 2.4 | ai_response_cache 연동 | 동일 조건(목적지+기간+예산+활동시간+동반인+취향 해시) 캐시 조회/저장 | Supabase |
| 2.5 | POST /api/trips 구현 | 최초 생성 API, revision=1 반환 | NestJS |
| 2.6 | 결과 표시 화면(일정표) | 일자별 카드 UI | React, MUI |

**완료 기준**: 폼 입력 → AI 생성 → 결과 표시까지 에러 없이 동작, 동일 조건 재요청 시 캐시 히트 확인

---

## Phase 3. 드래그 재조정 + 동선 판정 (Day 6-8, 핵심/최대 배정)

| WBS# | 작업 | 산출물 | 스택 |
|---|---|---|---|
| 3.1 | 드래그앤드롭 UI | 같은 날짜 내 활동 순서 변경 | dnd-kit |
| 3.2 | PATCH /trips/{id}/reorder 구현 | day + new_activity_order 요청 처리 | NestJS |
| 3.3 | 부분 재생성 프롬프트 설계 | 변경 day만 재계산, 나머지 원본 유지 강제 | Gemini API |
| 3.4 | 응답 검증 로직 | 미요청 day 변경 감지 시 프롬프트 위반으로 재시도 | - |
| 3.5 | 지오코딩 연동 | 활동 location → 좌표 변환 | OpenStreetMap Nominatim |
| 3.6 | 거리/동선 판정 로직 | Haversine 직선거리 + 룰 체크 + AI 자연어 사유 | Haversine, Gemini API |
| 3.7 | route_warning 구조화 반환 | flagged/reason 필드, revision 증가, 스냅샷 보관 | NestJS |
| 3.8 | 경고 배지 + tips UI | day 카드에 경고 배지, "동선 최적화 재요청" 버튼 | React, MUI |

**완료 기준**: 드래그 → 재조정 요청 → 변경한 날짜만 갱신, 나머지 원본 유지 확인 / 재조정 2회 이상 반복 시 revision 누적 확인 / 동선 이상 판정 시 배지 노출 확인

---

## Phase 4. 저장/목록/관리자 화면 (Day 9)

| WBS# | 작업 | 산출물 | 스택 |
|---|---|---|---|
| 4.1 | 저장한 여행 목록 화면 | GET /trips (최신순) | React |
| 4.2 | 여행 상세 조회 화면 | GET /trips/{id} | React |
| 4.3 | 관리자 - 품질 모니터링 화면 | GET /admin/flagged-trips | React, NestJS |
| 4.4 | 관리자 - 인기 목적지 통계 화면 | GET /admin/stats/destinations (SQL GROUP BY) | Supabase SQL |
| 4.5 | 관리자 - 프롬프트 템플릿 관리 | GET/PUT /admin/prompt-templates | React, NestJS |

**완료 기준**: 저장→목록→상세 재열람 동작 / 관리자 3개 화면 접근·동작, 일반 사용자는 403 확인

---

## Phase 5. 문서화, 배포 및 QA (Day 10)

| WBS# | 작업 | 산출물 | 스택 |
|---|---|---|---|
| 5.1 | Swagger API 문서화 | 9절 전체 엔드포인트 문서 반영 | @nestjs/swagger |
| 5.2 | 프론트엔드 배포 | Vercel 배포 및 환경변수 설정 | Vercel, .env |
| 5.3 | 백엔드 배포 | Render 배포 및 환경변수 설정 | Render, .env |
| 5.4 | 엣지케이스 점검 | 10절 에러 케이스 전항목 수동 확인 | - |
| 5.5 | DoD 체크리스트 검증 | PRD 13절 완료 기준 전항목 검증, 실비용 $10 이내 확인 | - |

**완료 기준**: 프론트/백엔드 모두 배포되어 URL 접근 가능, Swagger 문서에 모든 API 반영, 13절 DoD 모든 항목 충족, 실비용 $10 이내

---

## 리스크 메모

- Phase 3(드래그 재조정+동선 판정)이 최대 리스크 구간 — 부분 재생성 검증 로직이 예상보다 오래 걸릴 경우 Phase 4 범위를 줄여 대응
- Gemini API 실제 무료 티어 한도는 Phase 2 시작 전 별도 확인 필요(PRD 12.4 비고)
