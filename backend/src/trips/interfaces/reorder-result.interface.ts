import { GeneratedActivity } from './generated-itinerary.interface';

/**
 * 재조정(부분 재생성) 결과 계약 (PRD §6.3, §6.5, §8.3, WBS Phase 3).
 *
 * backend-developer의 PATCH /trips/:id/reorder 컨트롤러/서비스가 이 인터페이스에
 * 의존해 병렬로 구현되므로, 필드명/타입을 임의로 바꾸지 않는다.
 */
export interface RouteWarningResult {
  flagged: boolean;
  reason: string | null;
}

export interface ReorderedDayResult {
  /** 보통 원본 theme을 그대로 유지한다(활동 내용은 바뀌지 않으므로 재산정 불필요). */
  theme: string | null;
  /**
   * activityKey 집합은 입력(activities)과 100% 동일해야 한다(추가/누락 절대 금지).
   * 순서는 입력받은 순서(new_activity_order)를 그대로 따른다.
   */
  activities: GeneratedActivity[];
  routeWarning: RouteWarningResult;
}
