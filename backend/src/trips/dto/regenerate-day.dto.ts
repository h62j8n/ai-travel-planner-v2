import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { TripDayInputDto } from './temp-trip.dto';

/**
 * PATCH /api/trips/{trip_id}/regenerate-day 요청 바디 (PRD §6.3.2, §8.2, §9 / WBS 2.8,
 * v2.6 - 미리보기 전용)
 * trip_id는 URL 경로 파라미터로 전달되므로 바디에는 포함하지 않는다. budgetLevel/companion/
 * preferences/durationDays 등은 서버가 DB에서 조회하지만, 다른 day 정보(중복 방지용)는
 * DB가 아니라 함께 보낸 days[](현재 화면의 로컬 일정 전체)에서 서버가 직접 추출한다.
 */
export class RegenerateDayDto {
  @ApiProperty({
    example: 2,
    description: '활동 전체를 새로 생성할 일차(1부터 시작)',
  })
  @IsInt({ message: 'day는 정수여야 합니다.' })
  @Min(1, { message: 'day는 1 이상이어야 합니다.' })
  day: number;

  @ApiProperty({
    type: [TripDayInputDto],
    description:
      '현재 화면에 표시된 로컬 일정 전체(§8.3 출력 그대로). 다른 day 정보(중복 방지용)를 ' +
      '이 필드에서 추출하며, 대상 day 외에는 응답에서 그대로 relay된다.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'days는 최소 1개 이상이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripDayInputDto)
  days: TripDayInputDto[];
}
