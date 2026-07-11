import { ApiProperty } from '@nestjs/swagger';

/**
 * GET /api/trips 응답 항목 (PRD §9 "내 저장 목록(최신순)").
 * PRD §8.3에는 목록 전용 스키마가 별도로 명시되어 있지 않으므로,
 * docs/wireframe/저장한여행목록_와이어프레임.html의 카드 UI가 실제로 필요로 하는 필드만
 * 담은 경량 DTO로 설계했다(목적지, 기간, 요약, 동선 주의 여부).
 *
 * TripResponseDto(§8.3 상세 스키마)처럼 days[].activities[] 전체를 내려주지 않는 이유:
 * - 목록 화면 카드에는 day/activity 상세가 전혀 쓰이지 않는다(와이어프레임 참고).
 * - 저장 목록은 한 번에 여러 건을 내려주므로, 트립마다 전체 일정(모든 day의 모든 activity)을
 *   로드/직렬화하면 불필요한 DB 조회량과 응답 페이로드가 커진다.
 * - 상세가 필요한 시점(카드 클릭)에는 GET /api/trips/{trip_id}(별도 작업 범위)에서
 *   TripResponseDto 전체를 조회하도록 이미 화면 흐름이 설계되어 있다(와이어프레임 주석 참고).
 *
 * flagged_days_count: 해당 trip의 itinerary_days 중 route_warning_flagged=true인 일자 수.
 * 목록 카드 UI에서는 표시하지 않지만(상세 화면 DayCard에서 day별로 이미 노출됨), 추후 활용
 * 가능성을 열어두기 위해 응답에는 유지한다.
 *
 * summary: trips.summary(AI가 생성한 일정 한줄 요약, nullable)를 목록 카드에도 노출한다.
 * preferences/revision/duration_days는 목록 카드 UI에서 사용하지 않아 이 DTO에서 제외했다
 * (상세 조회 TripResponseDto에는 그대로 유지됨. duration_days는 카드에서 "(N일)" 표시를
 * 제거하기로 하면서 응답에서도 제외했다).
 */
export class TripListItemDto {
  @ApiProperty({
    example: 'a1b2c3d4-...',
    description: '여행 식별자(trips.id)',
  })
  trip_id: string;

  @ApiProperty({ example: '부산' })
  destination: string;

  @ApiProperty({ example: '2026-08-10' })
  start_date: string;

  @ApiProperty({ example: '2026-08-12' })
  end_date: string;

  @ApiProperty({
    example: '부산 해운대 중심의 힐링 여행',
    description: 'AI가 생성한 일정 한줄 요약(trips.summary)',
    nullable: true,
  })
  summary: string | null;

  @ApiProperty({
    example: 0,
    description:
      'route_warning.flagged=true인 일자 수(목록 카드 UI에서는 미사용, 상세 화면에서 day별로 노출됨)',
  })
  flagged_days_count: number;

  @ApiProperty({ example: '2026-07-10T10:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-07-11T09:30:00.000Z' })
  updated_at: string;
}
