import { z } from 'zod';

/**
 * backend/src/auth/dto/signup.dto.ts, login.dto.ts 제약과 일치시킨다.
 * (이메일 형식, 비밀번호 8~72자)
 */
const emailSchema = z
  .string()
  .min(1, '이메일을 입력해 주세요.')
  .email('올바른 이메일 형식이 아닙니다.');

const passwordSchema = z
  .string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
  .max(72, '비밀번호는 최대 72자까지 가능합니다.');

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력해 주세요.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type SignupFormValues = z.infer<typeof signupSchema>;
