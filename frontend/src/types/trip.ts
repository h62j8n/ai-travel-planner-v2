/**
 * PRD 8.3 출력 데이터 스펙 기준 타입 정의.
 * 화면/API 연동 전 단계이므로 타입 스켈레톤만 정의한다.
 */

export interface RouteWarning {
  flagged: boolean;
  reason: string | null;
}

export interface Activity {
  id: string;
  time: string | null;
  title: string;
  description: string | null;
  category: string;
  duration_minutes: number | null;
  location: string | null;
  estimated_cost: number | null;
  tips: string | null;
}

export interface TripDay {
  day: number;
  theme: string | null;
  activities: Activity[];
  last_modified: boolean;
  route_warning: RouteWarning;
}

export interface TripMeta {
  generated_at: string;
  revision: number;
}

export interface Trip {
  trip_id: string;
  destination: string;
  duration_days: number;
  summary: string | null;
  preferences: string[];
  days: TripDay[];
  meta: TripMeta;
}

/** PRD 8.1 최초 생성 입력 */
export interface TripCreateInput {
  destination: string;
  start_date: string;
  end_date: string;
  budget_level: string;
  activity_time_start: string;
  activity_time_end: string;
  companion: string;
  preferences: string[];
}

/** PRD 8.2 재조정 요청 입력 (저장 후, trip_id 기반) */
export interface TripReorderInput {
  trip_id: string;
  day: number;
  new_activity_order: string[];
}

/**
 * PRD 8.3 "주의" 문단: 저장 전(임시) 엔드포인트
 * (POST /trips/generate, /trips/regenerate, PATCH /trips/reorder, /trips/regenerate-day) 응답에는
 * trip_id/meta.revision이 없다. generated_at만 내려온다.
 */
export interface TempTripMeta {
  generated_at: string;
}

/**
 * 저장 전(임시) 응답 스키마. backend TempTripResponseDto와 1:1 대응.
 * Trip과 달리 trip_id가 없으므로 별도 타입으로 분리한다.
 */
export interface TempTrip {
  destination: string;
  duration_days: number;
  summary: string | null;
  preferences: string[];
  days: TripDay[];
  meta: TempTripMeta;
}

/**
 * 프론트가 "임시 조정" 화면(예: /trips/draft)에서 들고 있는 현재 상태.
 * 서버의 임시 조정 엔드포인트(reorder/regenerate-day/regenerate)는 stateless라 아무것도 기억하지
 * 않으므로, 최초 생성 입력값(TripCreateInput) 전체를 응답의 summary/duration_days/days와 함께
 * 계속 들고 있다가 매 요청마다 다시 실어 보내야 한다(PRD 8.2).
 */
export type DraftTrip = TripCreateInput &
  Pick<TempTrip, 'summary' | 'duration_days' | 'days'>;

/**
 * GET /trips (PRD 9절 "내 저장 목록(최신순)") 응답 아이템.
 * backend/src/trips/dto/trip-list-item.dto.ts와 1:1 대응하는 카드 전용 경량 스키마.
 * days/activities 상세는 포함하지 않는다 — 상세는 GET /trips/{trip_id}(TripResponseDto)에서 조회한다.
 * flagged_days_count는 route_warning.flagged=true인 day 수. 목록 카드 UI에서는 사용하지 않는다
 * (상세 화면 DayCard에서 day별로 이미 노출됨).
 * duration_days는 목록 카드에 노출하지 않으므로 이 타입에 포함하지 않는다(상세 스키마인 Trip에는 유지).
 */
export interface TripListItem {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  flagged_days_count: number;
  created_at: string;
  updated_at: string;
}
