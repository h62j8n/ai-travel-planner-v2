import { z } from 'zod';

/**
 * PRD 8.1 최초 생성 입력 제약과 일치시킨다.
 * (목적지/기간/예산 최대 30자/활동 시간대/동반인/취향 다중 선택, 전 필드 필수)
 * 취향 옵션은 PRD 8.1 / 결정로그 15 (v2.3) enum을 따른다.
 */
export const PREFERENCE_OPTIONS = [
  '체험&액티비티',
  '자연',
  '유명 관광지',
  '힐링',
  '문화&예술&역사',
  '쇼핑',
  '먹방',
  'SNS 핫플레이스',
] as const;

export const COMPANION_OPTIONS = ['혼자', '친구', '연인/배우자', '아이', '부모님', '기타'] as const;

const dateSchema = z
  .string()
  .min(1, '날짜를 선택해 주세요.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).');

const timeSchema = z
  .string()
  .min(1, '시간을 선택해 주세요.')
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시간 형식이 올바르지 않습니다 (HH:MM).');

export const tripCreateSchema = z
  .object({
    destination: z.string().min(1, '목적지를 입력해 주세요.'),
    start_date: dateSchema,
    end_date: dateSchema,
    budget_level: z
      .string()
      .min(1, '예산 수준을 입력해 주세요.')
      .max(30, '예산 수준은 최대 30자까지 입력할 수 있습니다.'),
    activity_time_start: timeSchema,
    activity_time_end: timeSchema,
    companion: z
      .string()
      .min(1, '동반인을 선택해 주세요.')
      .refine((value) => (COMPANION_OPTIONS as readonly string[]).includes(value), {
        message: '동반인을 선택해 주세요.',
      }),
    preferences: z.array(z.string()).min(1, '취향을 하나 이상 선택해 주세요.'),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: '종료일은 시작일 이후여야 합니다.',
    path: ['end_date'],
  })
  .refine((data) => data.activity_time_end > data.activity_time_start, {
    message: '활동 종료 시간은 시작 시간 이후여야 합니다.',
    path: ['activity_time_end'],
  });

export type TripCreateFormValues = z.infer<typeof tripCreateSchema>;
