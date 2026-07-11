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

/** PRD 8.2 재조정 요청 입력 */
export interface TripReorderInput {
  trip_id: string;
  day: number;
  new_activity_order: string[];
}

/**
 * GET /trips (PRD 9절 "내 저장 목록(최신순)") 응답 아이템.
 * backend/src/trips/dto/trip-list-item.dto.ts와 1:1 대응하는 카드 전용 경량 스키마.
 * days/activities 상세는 포함하지 않는다 — 상세는 GET /trips/{trip_id}(TripResponseDto)에서 조회한다.
 * flagged_days_count는 route_warning.flagged=true인 day 수(0이면 "동선 주의" 뱃지 미표시).
 */
export interface TripListItem {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  preferences: string[];
  revision: number;
  flagged_days_count: number;
  created_at: string;
  updated_at: string;
}
