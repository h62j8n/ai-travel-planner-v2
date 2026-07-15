import apiClient from './client';
import type { TempTrip, Trip, TripCreateInput, TripDay, TripListItem } from '../types/trip';

/**
 * PRD 8.2 "임시(저장 전) 조정 요청 — 공통 바디": 8.1 입력 필드 전체 + summary + days[]
 * (프론트가 들고 있는 현재 임시 일정 그대로). reorder/regenerate-day/저장(POST /trips) 요청이
 * 공통으로 이 모양을 사용하고, 액션별 필드(day, new_activity_order 등)만 추가된다.
 */
interface DraftAdjustBase extends TripCreateInput {
  summary: string | null;
  days: TripDay[];
}

/**
 * POST /trips/generate (PRD 6.2.1, 8.1, 9절):
 * 최초 생성(임시). 응답은 trip_id/meta.revision이 없는 TempTrip이며 DB에는 저장되지 않는다.
 * 동일 조건이 ai_response_cache에 있으면 캐시 결과를 그대로 반환받는다(호출부는 신경쓸 필요 없음).
 */
export async function generateTrip(input: TripCreateInput): Promise<TempTrip> {
  const { data } = await apiClient.post<TempTrip>('/trips/generate', input);
  return data;
}

/**
 * POST /trips/regenerate (PRD 6.2.3, 9절):
 * 임시 상태에서 "전체 재생성". 입력값(destination/기간/예산/취향 등)만 그대로 재사용하고
 * (함께 보내는 days는 있어도 서버가 무시하므로 굳이 담지 않는다) AI를 새로 호출한다(캐시 항상 무시).
 * 응답은 TempTrip이며 DB에는 저장되지 않는다 — 새 trip_id로 이동하지 않고 같은 draft를 교체한다.
 */
export async function regenerateTripDraft(input: TripCreateInput): Promise<TempTrip> {
  const { data } = await apiClient.post<TempTrip>('/trips/regenerate', input);
  return data;
}

/**
 * PATCH /trips/reorder (PRD 6.3.1, 8.2, 9절):
 * 임시 상태에서 활동 순서 변경. 서버가 stateless라 DraftAdjustBase(입력값 전체+summary+days) +
 * day + new_activity_order를 매번 함께 실어 보내야 한다. 응답은 대상 day만 재계산된 TempTrip이며
 * 나머지 day는 요청받은 그대로 relay된다(DB 저장 X).
 */
export async function reorderTripDraft(
  payload: DraftAdjustBase & { day: number; new_activity_order: string[] },
): Promise<TempTrip> {
  const { data } = await apiClient.patch<TempTrip>('/trips/reorder', payload);
  return data;
}

/**
 * PATCH /trips/regenerate-day (PRD 6.3.2, 8.2, 9절):
 * 임시 상태에서 day 단위 활동 교체. DraftAdjustBase + day만 추가하면 되고, 다른 day의 활동 목록
 * (중복 방지용)은 함께 보낸 days[]에서 서버가 직접 추출하므로 별도로 보낼 필요 없다.
 * 응답은 대상 day만 새 활동으로 교체된 TempTrip(DB 저장 X).
 */
export async function regenerateDayDraft(
  payload: DraftAdjustBase & { day: number },
): Promise<TempTrip> {
  const { data } = await apiClient.patch<TempTrip>('/trips/regenerate-day', payload);
  return data;
}

/**
 * POST /trips (PRD 6.2.2, 9절): 저장 전용으로 의미가 바뀐 엔드포인트.
 * 현재 임시 일정(DraftAdjustBase: 입력값 전체 + summary + 조정된 최종 days)을 그대로 DB에
 * 영속화한다. AI를 다시 호출하지 않는다. 응답은 trip_id/meta.revision(=1)이 포함된 Trip 전체.
 */
export async function saveTrip(payload: DraftAdjustBase): Promise<Trip> {
  const { data } = await apiClient.post<Trip>('/trips', payload);
  return data;
}

/**
 * GET /trips (PRD 9절 "내 저장 목록(최신순)"):
 * 백엔드가 updated_at DESC로 정렬해 내려주므로 프론트에서 별도 재정렬은 하지 않는다.
 * days/activities는 포함하지 않는 카드 전용 경량 응답이다(TripListItem 참고).
 */
export async function getTrips(): Promise<TripListItem[]> {
  const { data } = await apiClient.get<TripListItem[]>('/trips');
  return data;
}

/**
 * GET /trips/{trip_id} (PRD 9절 "저장된 일정 상세"):
 * 목록 카드 클릭 시 조회하는 상세 전체(days/activities 포함, §8.3 스키마).
 */
export async function getTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get<Trip>(`/trips/${tripId}`);
  return data;
}

/**
 * PATCH /trips/{trip_id}/reorder (PRD 8.2, 9절, v2.6 - 미리보기 전용):
 * 요청 바디는 변경된 day, new_activity_order와 함께 현재 화면의 로컬 일정 전체(days)를
 * 담는다(trip_id는 URL) — 서버가 stateless라 대상 day의 현재 활동 집합을 DB가 아니라
 * 이 days에서 찾는다. 응답은 Trip과 동일 스키마이나 trip_id/meta.revision은 DB에 저장된
 * 현재 값 그대로이며 **DB에는 전혀 반영되지 않는다**. 대상 day만 재계산되고 나머지는
 * 요청받은 days 그대로 relay되므로, 응답으로 로컬 days state 전체를 교체하면 된다
 * (핵심 불변 규칙: 변경 요청한 day 외에는 절대 수정하지 않는다). DB 반영은 saveTripAdjustments로 별도 커밋한다.
 */
export async function reorderTrip(
  tripId: string,
  day: number,
  newActivityOrder: string[],
  days: TripDay[],
): Promise<Trip> {
  const { data } = await apiClient.patch<Trip>(`/trips/${tripId}/reorder`, {
    day,
    new_activity_order: newActivityOrder,
    days,
  });
  return data;
}

/**
 * POST /trips/{trip_id}/regenerate (PRD 6.2.2, 6.2.3, 9절, v2.6 - 미리보기 전용):
 * 요청 바디는 없음({}). 입력값(목적지/기간/예산/활동시간/동반인/취향)은 서버가 원본 trip 기준으로
 * 유지하고 AI만 새로 호출한다(ai_response_cache 무시). 응답은 trip_id/meta.revision이 없는
 * TempTrip이며 **DB에는 전혀 반영되지 않는다**(원본 trip도 그대로 유지). 저장하려면
 * saveRegeneratedTrip()으로 별도 커밋해야 하며, 그 경우 항상 새 trip_id가 생성된다.
 */
export async function regenerateTrip(tripId: string): Promise<TempTrip> {
  const { data } = await apiClient.post<TempTrip>(`/trips/${tripId}/regenerate`, {});
  return data;
}

/**
 * PATCH /trips/{trip_id}/regenerate-day (PRD 6.3.2, 9절, v2.6 - 미리보기 전용):
 * 요청 바디는 교체할 day 번호와 현재 화면의 로컬 일정 전체(days)를 담는다(trip_id는 URL,
 * 다른 day 정보는 이 days에서 서버가 직접 추출). 응답은 Trip과 동일 스키마이나
 * trip_id/meta.revision은 DB에 저장된 현재 값 그대로이며 **DB에는 전혀 반영되지 않는다**.
 * reorderTrip과 동일하게 응답으로 로컬 days state 전체를 교체하면 된다.
 */
export async function regenerateDayActivities(
  tripId: string,
  day: number,
  days: TripDay[],
): Promise<Trip> {
  const { data } = await apiClient.patch<Trip>(`/trips/${tripId}/regenerate-day`, {
    day,
    days,
  });
  return data;
}

/**
 * POST /trips/{trip_id}/save (PRD 8.2, 9절, v2.6 신규):
 * day 단위 미리보기(reorder/regenerate-day)로 누적된 변경을 같은 trip_id에 커밋한다.
 * 요청은 현재 화면의 최종 일정 전체(days)만 담으며, AI를 다시 호출하지 않는다.
 * 응답은 같은 trip_id를 유지한 Trip이며 meta.revision이 1 증가한다(여러 day를 모아
 * 저장했어도 1만 증가).
 */
export async function saveTripAdjustments(tripId: string, days: TripDay[]): Promise<Trip> {
  const { data } = await apiClient.post<Trip>(`/trips/${tripId}/save`, { days });
  return data;
}

/**
 * POST /trips/{trip_id}/regenerate/save (PRD 8.2, 9절, v2.6 신규):
 * 전체 재생성 미리보기(regenerateTrip) 응답을 그대로 되돌려보내 새로운 trip으로 커밋한다.
 * AI를 다시 호출하지 않고 전달받은 summary/days를 그대로 저장한다. 응답은 **새로운**
 * trip_id를 가진 Trip이며 revision=1로 시작한다. 원본 trip은 저장 목록에 그대로 남는다.
 */
export async function saveRegeneratedTrip(
  tripId: string,
  summary: string | null,
  days: TripDay[],
): Promise<Trip> {
  const { data } = await apiClient.post<Trip>(`/trips/${tripId}/regenerate/save`, {
    summary,
    days,
  });
  return data;
}
