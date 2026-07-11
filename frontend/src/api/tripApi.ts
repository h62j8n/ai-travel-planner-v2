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
