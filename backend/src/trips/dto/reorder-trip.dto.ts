import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsString, Min } from 'class-validator';

/**
 * PATCH /api/trips/{trip_id}/reorder 요청 바디 (PRD §8.2, §9)
 * trip_id는 URL 경로 파라미터로 전달되므로 바디에는 포함하지 않는다.
 */
export class ReorderTripDto {
  @ApiProperty({
    example: 2,
    description: '재조정할 일차(1부터 시작)',
  })
  @IsInt({ message: 'day는 정수여야 합니다.' })
  @Min(1, { message: 'day는 1 이상이어야 합니다.' })
  day: number;

  @ApiProperty({
    example: ['d2-a3', 'd2-a1', 'd2-a2'],
    description:
      '드래그 후 새 활동 순서(해당 day의 activity id 배열, 기존 활동 전체를 포함해야 함)',
  })
  @IsArray()
  @ArrayNotEmpty({
    message: 'new_activity_order는 최소 1개 이상이어야 합니다.',
  })
  @IsString({ each: true })
  new_activity_order: string[];
}
