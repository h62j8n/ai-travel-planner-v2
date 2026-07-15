import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * GET /api/admin/stats/destinations 쿼리 파라미터 (PRD §6.6, §9, ERD §5
 * "trips(destination) — 관리자 인기 목적지 통계용 GROUP BY 성능" 인덱스 활용).
 * 필터는 trips.created_at 기준.
 */
export const DESTINATION_STATS_PERIODS = ['all', 'month', 'week'] as const;
export type DestinationStatsPeriod = (typeof DESTINATION_STATS_PERIODS)[number];

export class DestinationStatsQueryDto {
  @ApiPropertyOptional({
    enum: DESTINATION_STATS_PERIODS,
    default: 'all',
    description:
      'all=전체 기간, month=이번 달(캘린더 월 기준), week=최근 7일. trips.created_at 기준 필터',
  })
  @IsOptional()
  @IsIn(DESTINATION_STATS_PERIODS, {
    message: 'period는 all, month, week 중 하나여야 합니다.',
  })
  period?: DestinationStatsPeriod = 'all';
}

/**
 * GET /api/admin/stats/destinations 응답 항목 하나.
 * destination(trips.destination) 기준 GROUP BY 집계 결과.
 */
export class DestinationStatItemDto {
  @ApiProperty({ example: 1, description: '생성 건수 내림차순 순위(1부터)' })
  rank: number;

  @ApiProperty({ example: '제주도' })
  destination: string;

  @ApiProperty({ example: 42, description: '해당 목적지로 생성된 trip 건수' })
  count: number;

  @ApiProperty({
    example: '2026-07-10T03:00:00.000Z',
    description: '해당 목적지로 가장 최근에 생성된 trip의 created_at',
  })
  lastCreatedAt: string;
}

export class DestinationStatsResponseDto {
  @ApiProperty({ enum: DESTINATION_STATS_PERIODS, example: 'all' })
  period: DestinationStatsPeriod;

  @ApiProperty({ type: DestinationStatItemDto, isArray: true })
  items: DestinationStatItemDto[];
}
