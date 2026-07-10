import { Injectable } from '@nestjs/common';
import { CreateTripDto } from './dto/create-trip.dto';
import { GeneratedItinerary } from './interfaces/generated-itinerary.interface';

/**
 * TODO(ai-specialist, WBS 2.2/2.3): 지금은 Gemini API 연동 전이므로,
 * 실제 AI 호출 대신 결정론적(deterministic) 플레이스홀더 일정을 생성한다.
 * - 담당 범위 밖(backend-developer는 POST /api/trips의 트랜잭션/영속화/응답 스키마만 책임짐, WBS 2.5).
 * - ai-specialist가 이 클래스의 generate() 내부만 실제 Gemini 호출 + 8.3 스키마 파싱/검증
 *   (실패 시 1회 재시도, PRD §10)으로 교체하면 TripsService/컨트롤러는 수정할 필요가 없도록
 *   인터페이스(GeneratedItinerary)를 고정해 두었다.
 * - 동일 입력에 대해 항상 동일한 결과를 반환해야 한다(ai_response_cache 캐시 히트 확인 시나리오와
 *   호환되도록). 실제 Gemini 연동 후에도 이 성질(캐시 키가 같으면 응답도 같음)은 유지되어야 한다.
 */
@Injectable()
export class ItineraryGeneratorService {
  generate(dto: CreateTripDto, durationDays: number): GeneratedItinerary {
    const days = Array.from({ length: durationDays }, (_, index) => {
      const dayNumber = index + 1;
      return {
        dayNumber,
        theme: `${dto.destination} ${dayNumber}일차 (임시 생성 결과)`,
        activities: [
          {
            activityKey: `d${dayNumber}-a1`,
            time: '09:00',
            title: `${dto.destination} 주요 명소 탐방`,
            description:
              'AI 연동 전 임시 생성 데이터입니다. 실제 Gemini 연동 후 대체됩니다.',
            category: dto.preferences[0] ?? '관광',
            durationMinutes: 120,
            location: dto.destination,
            estimatedCost: 0,
            tips: null,
          },
        ],
        routeWarningFlagged: false,
        routeWarningReason: null,
      };
    });

    return {
      summary: `${dto.destination} ${durationDays}일 일정 (${dto.budget_level}, ${dto.preferences.join(', ')}) - 임시 생성 결과`,
      days,
    };
  }
}
