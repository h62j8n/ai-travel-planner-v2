import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  COMPANION_OPTIONS,
  PREFERENCE_OPTIONS,
  TIME_HH_MM_REGEX,
} from '../constants/trip-options.constants';
import type {
  Companion,
  Preference,
} from '../constants/trip-options.constants';

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/trips 요청 바디 (PRD §8.1 최초 생성 입력 / §9, 결정로그 §15 v2.3)
 * 프론트 frontend/src/trips/tripSchemas.ts의 zod 스키마와 제약을 맞춘다.
 */
export class CreateTripDto {
  @ApiProperty({ example: '부산', description: '목적지(텍스트, 제한 없음)' })
  @IsString()
  @IsNotEmpty({ message: '목적지를 입력해주세요.' })
  destination: string;

  @ApiProperty({
    example: '2026-08-01',
    description: '여행 시작일 (YYYY-MM-DD)',
  })
  @IsString()
  @Matches(DATE_FORMAT_REGEX, {
    message: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).',
  })
  start_date: string;

  @ApiProperty({
    example: '2026-08-03',
    description: '여행 종료일 (YYYY-MM-DD)',
  })
  @IsString()
  @Matches(DATE_FORMAT_REGEX, {
    message: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).',
  })
  end_date: string;

  @ApiProperty({
    example: '중간',
    maxLength: 30,
    description: '예산 수준(자유 텍스트, 최대 30자)',
  })
  @IsString()
  @MaxLength(30, { message: '예산 수준은 최대 30자까지 입력할 수 있습니다.' })
  budget_level: string;

  @ApiProperty({
    example: '09:00',
    description: '활동 시간대 시작 (HH:MM, 24시간제)',
  })
  @IsString()
  @Matches(TIME_HH_MM_REGEX, {
    message: '활동 시간대 시작 형식이 올바르지 않습니다 (HH:MM, 24시간제).',
  })
  activity_time_start: string;

  @ApiProperty({
    example: '20:00',
    description: '활동 시간대 종료 (HH:MM, 24시간제)',
  })
  @IsString()
  @Matches(TIME_HH_MM_REGEX, {
    message: '활동 시간대 종료 형식이 올바르지 않습니다 (HH:MM, 24시간제).',
  })
  activity_time_end: string;

  @ApiProperty({
    example: '친구',
    description: '여행 동반인',
    enum: COMPANION_OPTIONS,
  })
  @IsIn(COMPANION_OPTIONS, {
    message: `동반인은 다음 중 하나여야 합니다: ${COMPANION_OPTIONS.join(', ')}`,
  })
  companion: Companion;

  @ApiProperty({
    example: ['힐링', '먹방'],
    description: '취향(다중 선택)',
    enum: PREFERENCE_OPTIONS,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty({ message: '취향을 하나 이상 선택해주세요.' })
  @IsIn(PREFERENCE_OPTIONS, {
    each: true,
    message: `취향은 다음 중에서만 선택할 수 있습니다: ${PREFERENCE_OPTIONS.join(', ')}`,
  })
  preferences: Preference[];
}
