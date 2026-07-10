import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { signup, extractErrorMessage } from '../../api/authApi';
import { saveSession } from '../../auth/authStorage';
import { signupSchema, type SignupFormValues } from '../../auth/authSchemas';

const SIGNUP_SUCCESS_REDIRECT_DELAY_MS = 1200;

/**
 * 회원가입 화면 (PRD 6.1).
 * 이메일/비밀번호 입력 폼, react-hook-form + zod로 이메일 형식/비밀번호 길이 검증.
 * 가입 성공 시 백엔드가 즉시 JWT를 발급하므로(AuthResponseDto),
 * 이를 그대로 sessionStorage에 저장해 로그인된 상태로 전환한다.
 */
function SignupPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signupSucceeded, setSignupSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setSubmitError(null);
    try {
      // 백엔드 SignupDto에는 confirmPassword가 없으므로 email/password만 전송한다.
      const auth = await signup({ email: values.email, password: values.password });
      saveSession(auth);
      setSignupSucceeded(true);
    } catch (error) {
      setSubmitError(
        extractErrorMessage(error, '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
      );
    }
  };

  useEffect(() => {
    if (!signupSucceeded) return;

    const timer = setTimeout(() => {
      navigate('/trips/new', { replace: true });
    }, SIGNUP_SUCCESS_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [signupSucceeded, navigate]);

  return (
    <Container maxWidth="xs" sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center' }}>
      <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1" sx={{ textAlign: 'center' }}>
            회원가입
          </Typography>

          {submitError && <Alert severity="error">{submitError}</Alert>}

          {signupSucceeded && (
            <Alert severity="success">
              회원가입이 완료되었습니다. 잠시 후 일정 생성 화면으로 이동합니다.
            </Alert>
          )}

          {!signupSucceeded && (
            <>
              <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <TextField
                    label="이메일"
                    type="email"
                    autoComplete="email"
                    fullWidth
                    error={!!errors.email}
                    helperText={errors.email?.message}
                    {...register('email')}
                  />
                  <TextField
                    label="비밀번호"
                    type="password"
                    autoComplete="new-password"
                    fullWidth
                    error={!!errors.password}
                    helperText={errors.password?.message ?? '8~72자로 입력해 주세요.'}
                    {...register('password')}
                  />
                  <TextField
                    label="비밀번호 확인"
                    type="password"
                    autoComplete="new-password"
                    fullWidth
                    error={!!errors.confirmPassword}
                    helperText={errors.confirmPassword?.message}
                    {...register('confirmPassword')}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={isSubmitting}
                  >
                    회원가입
                  </Button>
                </Stack>
              </Box>

              <Typography variant="body2" sx={{ textAlign: 'center' }}>
                이미 계정이 있으신가요?{' '}
                <Link component={RouterLink} to="/login">
                  로그인
                </Link>
              </Typography>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}

export default SignupPage;
