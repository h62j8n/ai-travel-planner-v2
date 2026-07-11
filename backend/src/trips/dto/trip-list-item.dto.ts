import { ApiProperty } from '@nestjs/swagger';

/**
 * GET /api/trips 응답 항목 (PRD §9 "내 저장 목록(최신순)").
 * PRD §8.3에는 목록 전용 스키마가 별도로 명시되어 있지 않으므로,
 * docs/wireframe/저장한여행목록_와이어프레임.html의 카드 UI가 실제로 필요로 하는 필드만
 * 담은 경량 DTO로 설계했다(목적지, 기간, revision, 동선 주의 여부, 취향 태그).
 *
 * TripResponseDto(§8.3 상세 스키마)처럼 days[].activities[] 전체를 내려주지 않는 이유:
 * - 목록 화면 카드에는 day/activity 상세가 전혀 쓰이지 않는다(와이어프레임 참고).
 * - 저장 목록은 한 번에 여러 건을 내려주므로, 트립마다 전체 일정(모든 day의 모든 activity)을
 *   로드/직렬화하면 불필요한 DB 조회량과 응답 페이로드가 커진다.
 * - 상세가 필요한 시점(카드 클릭)에는 GET /api/trips/{trip_id}(별도 작업 범위)에서
 *   TripResponseDto 전체를 조회하도록 이미 화면 흐름이 설계되어 있다(와이어프레임 주석 참고).
 *
 * flagged_days_count: CLAUDE.md 핵심 규칙("route_warning은 사용자 화면에도 즉시 노출")을
 * 목록 카드에서도 지키기 위해, 해당 trip의 itinerary_days 중 route_warning_flagged=true인
 * 일자 수를 세어 내려준다(0이면 뱃지 미표시, 1 이상이면 "동선 주의 N일" 뱃지 표시).
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

  @ApiProperty({ example: 3 })
  duration_days: number;

  @ApiProperty({ example: ['힐링', '먹방'], type: [String] })
  preferences: string[];

  @ApiProperty({ example: 1, description: '재조정 반영 횟수' })
  revision: number;

  @ApiProperty({
    example: 0,
    description:
      'route_warning.flagged=true인 일자 수(0이면 동선 주의 없음, 1 이상이면 목록 카드에 경고 뱃지 표시)',
  })
  flagged_days_count: number;

  @ApiProperty({ example: '2026-07-10T10:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-07-11T09:30:00.000Z' })
  updated_at: string;
}
