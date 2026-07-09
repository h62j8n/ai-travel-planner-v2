import { ApiProperty } from '@nestjs/swagger';

/**
 * GET /api/admin/flagged-trips 응답 항목 (PRD §6.5, §6.6 / §9)
 * 프론트 frontend/src/types/admin.ts의 FlaggedTripDay와 필드명을 그대로 맞춘다(snake_case).
 * flagged_at: itinerary_days에는 "판정 시각" 전용 컬럼이 없어(ERD §3.3),
 * AI가 이 day를 마지막으로 재계산한 시각인 last_modified_at을 사용하고,
 * 최초 생성 후 한 번도 재조정되지 않아 null인 경우에는 trip.updated_at으로 대체한다.
 */
export class FlaggedTripDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: '여행(trip) ID' })
  trip_id: string;

  @ApiProperty({ example: '부산' })
  destination: string;

  @ApiProperty({ example: 2, description: '이상 동선으로 판정된 일차' })
  day: number;

  @ApiProperty({
    example: '숙소에서 다음 장소까지 이동 시간이 90분을 초과합니다.',
    nullable: true,
  })
  reason: string | null;

  @ApiProperty({ example: '2026-07-08T10:00:00.000Z' })
  flagged_at: string;
}
