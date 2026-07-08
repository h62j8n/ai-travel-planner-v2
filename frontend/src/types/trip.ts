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
  time: string;
  title: string;
  description: string;
  category: string;
  duration_minutes: number;
  location: string;
  estimated_cost: number;
  tips: string | null;
}

export interface TripDay {
  day: number;
  theme: string;
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
  summary: string;
  days: TripDay[];
  meta: TripMeta;
}

/** PRD 8.1 최초 생성 입력 */
export interface TripCreateInput {
  destination: string;
  start_date: string;
  end_date: string;
  budget_level: string;
  preferences: string[];
}

/** PRD 8.2 재조정 요청 입력 */
export interface TripReorderInput {
  trip_id: string;
  day: number;
  new_activity_order: string[];
}
