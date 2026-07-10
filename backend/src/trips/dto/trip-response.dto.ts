import { ApiProperty } from '@nestjs/swagger';

/**
 * PRD §8.3 출력 데이터 스펙에 대응하는 응답 DTO 모음.
 * 프론트 frontend/src/types/trip.ts의 타입과 필드명(snake_case)을 그대로 맞춘다.
 *
 * 중요: Trip 엔티티의 PK 컬럼명은 `id`이지만, 응답 스펙은 `trip_id`를 요구하므로
 * TripsService에서 매핑할 때 반드시 `trip_id: trip.id`로 명시적으로 변환한다.
 * 활동(activity) 역시 엔티티 PK(uuid)가 아니라 ERD §3.4의 `activity_key`
 * (예: d1-a1, 프론트 표시용 키)를 응답의 `id` 필드로 매핑한다.
 */
export class RouteWarningDto {
  @ApiProperty({ example: false, description: 'AI 판정: 동선 이상 여부' })
  flagged: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: '판정 사유(자연어), flagged=false면 null',
  })
  reason: string | null;
}

export class TripActivityDto {
  @ApiProperty({
    example: 'd1-a1',
    description: '활동 식별 키(itinerary_activities.activity_key)',
  })
  id: string;

  @ApiProperty({ example: '09:00', nullable: true })
  time: string | null;

  @ApiProperty({ example: '해운대 도착' })
  title: string;

  @ApiProperty({ example: '해운대 해변 산책 및 사진 촬영', nullable: true })
  description: string | null;

  @ApiProperty({ example: '유명 관광지' })
  category: string;

  @ApiProperty({ example: 90, nullable: true })
  duration_minutes: number | null;

  @ApiProperty({ example: '해운대구', nullable: true })
  location: string | null;

  @ApiProperty({ example: 0, nullable: true })
  estimated_cost: number | null;

  @ApiProperty({ example: null, nullable: true })
  tips: string | null;
}

export class TripDayDto {
  @ApiProperty({ example: 1, description: '며칠차(1부터 시작)' })
  day: number;

  @ApiProperty({ example: '도착 및 시내 탐방', nullable: true })
  theme: string | null;

  @ApiProperty({ type: [TripActivityDto] })
  activities: TripActivityDto[];

  @ApiProperty({
    example: false,
    description:
      '이번 요청에서 실제로 재계산된 날짜인지(최초 생성 시 전부 false)',
  })
  last_modified: boolean;

  @ApiProperty({ type: RouteWarningDto })
  route_warning: RouteWarningDto;
}

export class TripMetaDto {
  @ApiProperty({ example: '2026-07-10T10:00:00.000Z' })
  generated_at: string;

  @ApiProperty({ example: 1, description: '재조정 반영 횟수(최초 생성 시 1)' })
  revision: number;
}

export class TripResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-...',
    description: '여행 식별자(trips.id)',
  })
  trip_id: string;

  @ApiProperty({ example: '부산' })
  destination: string;

  @ApiProperty({ example: 3 })
  duration_days: number;

  @ApiProperty({ example: '부산 2박 3일 힐링+먹방 일정', nullable: true })
  summary: string | null;

  @ApiProperty({ type: [TripDayDto] })
  days: TripDayDto[];

  @ApiProperty({ type: TripMetaDto })
  meta: TripMetaDto;
}
