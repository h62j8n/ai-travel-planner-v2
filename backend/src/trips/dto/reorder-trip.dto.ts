import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { TripDayInputDto } from './temp-trip.dto';

/**
 * PATCH /api/trips/{trip_id}/reorder 요청 바디 (PRD §8.2, §9, v2.6 - 미리보기 전용)
 * trip_id는 URL 경로 파라미터로 전달되므로 바디에는 포함하지 않는다.
 * destination/활동시간대 등 정적 입력값은 서버가 trip_id로 DB에서 직접 조회하므로
 * 바디에 포함하지 않지만, 같은 세션에서 다른 day를 먼저 미리보기했을 수 있으므로
 * 그 상태를 잃지 않도록 days[](현재 화면의 로컬 일정 전체)를 함께 받는다.
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

  @ApiProperty({
    type: [TripDayInputDto],
    description:
      '현재 화면에 표시된 로컬 일정 전체(§8.3 출력 그대로). 대상 day의 현재 활동 집합 ' +
      '검증과 재정렬 입력을 이 필드에서 찾으며, 대상 day 외에는 응답에서 그대로 relay된다.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'days는 최소 1개 이상이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripDayInputDto)
  days: TripDayInputDto[];
}
