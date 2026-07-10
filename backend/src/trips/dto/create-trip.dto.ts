import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/trips 요청 바디 (PRD §8.1 최초 생성 입력 / §9)
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
    example: ['힐링', '먹방'],
    description: '취향(다중 선택)',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: '취향을 하나 이상 선택해주세요.' })
  @IsString({ each: true })
  preferences: string[];
}
