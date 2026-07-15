import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateTripDto } from './create-trip.dto';

/**
 * PRD §2.5 "임시 조정 → 명시적 저장" 플로우(§6.2, §8.2, §9)에서 쓰이는 요청 DTO 모음.
 *
 * 이 4개 엔드포인트(POST /trips/generate·regenerate, PATCH /trips/reorder·regenerate-day)와
 * POST /trips(저장)는 서버가 DB에 상태를 들고 있지 않으므로(stateless), 클라이언트가
 * sessionStorage에 들고 있는 현재 임시 일정 전체(§8.3 출력 스키마의 days[])를 매 요청마다
 * 함께 보낸다. 응답 DTO(TripDayDto/TripActivityDto, trip-response.dto.ts)와 필드가
 * 1:1로 대응하되, 이쪽은 "요청 바디"이므로 class-validator로 구조를 검증할 수 있어야 한다.
 */
export class RouteWarningInputDto {
  @ApiProperty({ example: false, description: 'AI 판정: 동선 이상 여부' })
  @IsBoolean()
  flagged: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    required: false,
    description: '판정 사유(자연어), flagged=false면 null',
  })
  @IsOptional()
  @IsString()
  reason: string | null;
}

export class TripActivityInputDto {
  @ApiProperty({
    example: 'd1-a1',
    description: '활동 식별 키(응답 §8.3 activities[].id를 그대로 되돌려줌)',
  })
  @IsString()
  id: string;

  @ApiProperty({ example: '09:00', nullable: true, required: false })
  @IsOptional()
  @IsString()
  time: string | null;

  @ApiProperty({ example: '해운대 도착' })
  @IsString()
  title: string;

  @ApiProperty({
    example: '해운대 해변 산책 및 사진 촬영',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  description: string | null;

  @ApiProperty({ example: '유명 관광지' })
  @IsString()
  category: string;

  @ApiProperty({ example: 90, nullable: true, required: false })
  @IsOptional()
  @IsInt()
  duration_minutes: number | null;

  @ApiProperty({ example: '해운대구', nullable: true, required: false })
  @IsOptional()
  @IsString()
  location: string | null;

  @ApiProperty({ example: 0, nullable: true, required: false })
  @IsOptional()
  @IsInt()
  estimated_cost: number | null;

  @ApiProperty({ example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  tips: string | null;
}

export class TripDayInputDto {
  @ApiProperty({ example: 1, description: '며칠차(1부터 시작)' })
  @IsInt({ message: 'day는 정수여야 합니다.' })
  @Min(1, { message: 'day는 1 이상이어야 합니다.' })
  day: number;

  @ApiProperty({
    example: '도착 및 시내 탐방',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  theme: string | null;

  @ApiProperty({ type: [TripActivityInputDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '각 day는 활동을 최소 1개 이상 포함해야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripActivityInputDto)
  activities: TripActivityInputDto[];

  @ApiProperty({
    example: false,
    required: false,
    description: '직전 요청에서 실제로 재계산된 날짜인지(프론트 상태 relay용)',
  })
  @IsOptional()
  @IsBoolean()
  last_modified?: boolean;

  @ApiProperty({ type: RouteWarningInputDto })
  @ValidateNested()
  @Type(() => RouteWarningInputDto)
  route_warning: RouteWarningInputDto;
}

/**
 * 임시(저장 전) 조정 요청 공통 바디(PRD §8.2): §8.1 입력 전체 + summary + days[].
 * ReorderTempDto / RegenerateDayTempDto / SaveTripDto가 이 바디를 상속해 액션별
 * 추가 필드만 덧붙인다.
 */
export class TempAdjustBaseDto extends CreateTripDto {
  @ApiProperty({
    example: '부산 2박 3일 힐링+먹방 일정',
    nullable: true,
    required: false,
    description: '현재 임시 일정의 summary(§8.3 출력 그대로)',
  })
  @IsOptional()
  @IsString()
  summary: string | null;

  @ApiProperty({
    type: [TripDayInputDto],
    description:
      '프론트가 sessionStorage에 들고 있는 현재 임시 일정의 day 배열(§8.3 출력 그대로)',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'days는 최소 1개 이상이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripDayInputDto)
  days: TripDayInputDto[];
}

/** PATCH /api/trips/reorder 요청 바디 (PRD §8.2, §9) */
export class ReorderTempDto extends TempAdjustBaseDto {
  @ApiProperty({ example: 2, description: '재조정할 일차(1부터 시작)' })
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

/** PATCH /api/trips/regenerate-day 요청 바디 (PRD §8.2, §9) */
export class RegenerateDayTempDto extends TempAdjustBaseDto {
  @ApiProperty({
    example: 2,
    description: '활동 전체를 새로 생성할 일차(1부터 시작)',
  })
  @IsInt({ message: 'day는 정수여야 합니다.' })
  @Min(1, { message: 'day는 1 이상이어야 합니다.' })
  day: number;
}

/**
 * POST /api/trips(저장) 요청 바디 (PRD §9): 8.1 입력 전체 + summary + days[](프론트가
 * 조정한 최종 임시 일정). 추가 필드 없이 TempAdjustBaseDto와 동일한 형태다.
 */
export class SaveTripDto extends TempAdjustBaseDto {}

/**
 * POST /api/trips/{trip_id}/save 요청 바디 (PRD §8.2, §9, v2.6 신규)
 * day 단위 미리보기(reorder/regenerate-day)로 누적된 로컬 변경을 같은 trip_id에
 * 반영할 때 쓰인다. trip_id는 URL 경로 파라미터이고, destination 등 정적 입력값은
 * DB에 이미 저장돼 있으므로 요청 바디는 최종 일정(days[])만 담는다. day 개수는
 * trip.duration_days와 정확히 일치해야 한다(서버가 구조 검증).
 */
export class SaveTripDaysDto {
  @ApiProperty({
    type: [TripDayInputDto],
    description:
      '현재 화면에 표시된 최종 일정 전체(§8.3 출력 그대로). day 개수는 ' +
      'trip.duration_days와 정확히 일치해야 함(중복/누락 없이).',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'days는 최소 1개 이상이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripDayInputDto)
  days: TripDayInputDto[];
}

/**
 * POST /api/trips/{trip_id}/regenerate/save 요청 바디 (PRD §8.2, §9, v2.6 신규)
 * 전체 재생성 미리보기(POST /trips/{trip_id}/regenerate) 응답을 그대로 되돌려받아
 * 새로운 trip으로 커밋할 때 쓰인다. AI를 다시 호출하지 않고 그대로 저장하므로,
 * 미리보기 응답의 summary/days를 그대로 담는다.
 */
export class RegenerateSaveDto {
  @ApiProperty({
    example: '부산 2박 3일 힐링+먹방 일정',
    nullable: true,
    required: false,
    description: '전체 재생성 미리보기 응답의 summary를 그대로 전달',
  })
  @IsOptional()
  @IsString()
  summary: string | null;

  @ApiProperty({
    type: [TripDayInputDto],
    description:
      '전체 재생성 미리보기 응답의 days를 그대로 전달(§8.3 출력 그대로)',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'days는 최소 1개 이상이어야 합니다.' })
  @ValidateNested({ each: true })
  @Type(() => TripDayInputDto)
  days: TripDayInputDto[];
}
