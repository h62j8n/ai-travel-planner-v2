/**
 * PRD §8.1 최초 생성 입력의 companion/preferences enum 고정값 (결정로그 §15, v2.3).
 * ERD §3.2 trips.companion CHECK 제약과 반드시 동일한 문자열 목록을 유지해야 한다.
 * DTO(class-validator IsIn)와 엔티티 CHECK 제약, 이후 프론트 옵션 목록에서도
 * 이 상수를 단일 진실 공급원(single source of truth)으로 참조한다.
 */
export const COMPANION_OPTIONS = [
  '혼자',
  '친구',
  '연인/배우자',
  '아이',
  '부모님',
  '기타',
] as const;

export type Companion = (typeof COMPANION_OPTIONS)[number];

/**
 * PRD §8.1 preferences 다중 선택 enum (결정로그 §15, v2.3).
 * 기존 자유 문자열/다른 목록(예: '액티비티', '야경')을 이 8개 고정값으로 교체한다.
 */
export const PREFERENCE_OPTIONS = [
  '체험&액티비티',
  '자연',
  '유명 관광지',
  '힐링',
  '문화&예술&역사',
  '쇼핑',
  '먹방',
  'SNS 핫플레이스',
] as const;

export type Preference = (typeof PREFERENCE_OPTIONS)[number];

/** ERD §3.2 companion CHECK (companion IN (...))에 그대로 대응하는 SQL 문자열 조각. */
export const COMPANION_CHECK_CONSTRAINT = `companion IN (${COMPANION_OPTIONS.map((v) => `'${v}'`).join(', ')})`;

/** HH:MM(24시간제) 형식 검증용 정규식 (PRD §8.1 activity_time_start/end). */
export const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
