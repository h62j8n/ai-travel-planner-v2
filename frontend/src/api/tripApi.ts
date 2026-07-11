import apiClient from './client';
import type { Trip, TripCreateInput } from '../types/trip';

/**
 * backend/src/trips/trips.controller.ts 계약 (PRD 9절):
 * POST /trips -> PRD 8.3 출력 데이터 스펙(Trip, trip_id 포함, revision=1)
 * 동일 조건이 ai_response_cache에 있으면 캐시 결과를 그대로 반환받는다(호출부는 신경쓸 필요 없음).
 * 에러 메시지 추출은 api/authApi.ts의 extractErrorMessage를 그대로 재사용한다.
 */
export async function createTrip(input: TripCreateInput): Promise<Trip> {
  const { data } = await apiClient.post<Trip>('/trips', input);
  return data;
}

/**
 * PATCH /trips/{trip_id}/reorder (PRD 8.2, 9절):
 * 요청 바디는 변경된 day와 new_activity_order만 담는다(trip_id는 URL). 응답은 Trip 전체이며
 * 변경된 day만 last_modified:true, meta.revision이 1 증가한다. ai_response_cache는 적용되지 않는다.
 * 다른 day의 activities는 서버가 그대로 유지해 반환하므로, 응답으로 로컬 trip state 전체를
 * 교체하면 된다(핵심 불변 규칙: 변경 요청한 day 외에는 절대 수정하지 않는다).
 */
export async function reorderTrip(
  tripId: string,
  day: number,
  newActivityOrder: string[],
): Promise<Trip> {
  const { data } = await apiClient.patch<Trip>(`/trips/${tripId}/reorder`, {
    day,
    new_activity_order: newActivityOrder,
  });
  return data;
}

/**
 * POST /trips/{trip_id}/regenerate (PRD 6.2.2, 9절):
 * 요청 바디는 없음({}). 입력값(목적지/기간/예산/활동시간/동반인/취향)은 서버가 원본 trip 기준으로
 * 유지하고 AI만 새로 호출한다(ai_response_cache 무시). 응답은 **새로운** trip_id를 가진 Trip 전체이며
 * 기존 trip은 저장 목록에 그대로 남는다 — 호출부는 응답 trip_id로 일정표 화면을 다시 진입시켜야 한다.
 */
export async function regenerateTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.post<Trip>(`/trips/${tripId}/regenerate`, {});
  return data;
}

/**
 * PATCH /trips/{trip_id}/regenerate-day (PRD 6.3.2, 9절):
 * 요청 바디는 교체할 day 번호만 담는다(trip_id는 URL). 응답은 Trip 전체이며 해당 day만
 * last_modified:true로 교체되고 다른 day는 서버가 원본 그대로 유지해 반환한다(trip_id 동일,
 * meta.revision 1 증가). ai_response_cache는 적용되지 않는다. reorderTrip과 동일하게 응답으로
 * 로컬 trip state 전체를 교체하면 된다.
 */
export async function regenerateDayActivities(tripId: string, day: number): Promise<Trip> {
  const { data } = await apiClient.patch<Trip>(`/trips/${tripId}/regenerate-day`, { day });
  return data;
}
