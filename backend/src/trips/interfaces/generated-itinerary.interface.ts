/**
 * ItineraryGeneratorService의 생성 결과 형태.
 * ai_response_cache.response_json에도 이 구조 그대로 저장되며,
 * TripsService가 이를 trips/itinerary_days/itinerary_activities 테이블로 영속화한다.
 */
export interface GeneratedActivity {
  activityKey: string;
  time: string | null;
  title: string;
  description: string | null;
  category: string;
  durationMinutes: number | null;
  location: string | null;
  estimatedCost: number | null;
  tips: string | null;
}

export interface GeneratedDay {
  dayNumber: number;
  theme: string | null;
  activities: GeneratedActivity[];
  routeWarningFlagged: boolean;
  routeWarningReason: string | null;
}

export interface GeneratedItinerary {
  summary: string | null;
  days: GeneratedDay[];
}
