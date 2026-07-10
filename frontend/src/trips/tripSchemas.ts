import { z } from 'zod';

/**
 * PRD 8.1 최초 생성 입력 제약과 일치시킨다.
 * (목적지/기간/예산 최대 30자/취향 다중 선택, 전 필드 필수)
 * 취향 옵션은 docs/wireframe/일정생성폼_와이어프레임.html의 칩 목록을 따른다.
 */
export const PREFERENCE_OPTIONS = [
  '힐링',
  '먹방',
  '액티비티',
  '문화/역사',
  '쇼핑',
  '자연',
  '야경',
  '사진맛집',
] as const;

const dateSchema = z
  .string()
  .min(1, '날짜를 선택해 주세요.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).');

export const tripCreateSchema = z
  .object({
    destination: z.string().min(1, '목적지를 입력해 주세요.'),
    start_date: dateSchema,
    end_date: dateSchema,
    budget_level: z
      .string()
      .min(1, '예산 수준을 입력해 주세요.')
      .max(30, '예산 수준은 최대 30자까지 입력할 수 있습니다.'),
    preferences: z.array(z.string()).min(1, '취향을 하나 이상 선택해 주세요.'),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: '종료일은 시작일 이후여야 합니다.',
    path: ['end_date'],
  });

export type TripCreateFormValues = z.infer<typeof tripCreateSchema>;
