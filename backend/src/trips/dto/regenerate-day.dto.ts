import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * PATCH /api/trips/{trip_id}/regenerate-day 요청 바디 (PRD §6.3.2, §9 / WBS 2.8)
 * trip_id는 URL 경로 파라미터로 전달되므로 바디에는 포함하지 않는다.
 */
export class RegenerateDayDto {
  @ApiProperty({
    example: 2,
    description: '활동 전체를 새로 생성할 일차(1부터 시작)',
  })
  @IsInt({ message: 'day는 정수여야 합니다.' })
  @Min(1, { message: 'day는 1 이상이어야 합니다.' })
  day: number;
}
