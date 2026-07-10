import { useState } from 'react';
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

import { login, extractErrorMessage } from '../../api/authApi';
import { saveSession } from '../../auth/authStorage';
import { loginSchema, type LoginFormValues } from '../../auth/authSchemas';

/**
 * 사용자 로그인 화면 (PRD 6.1).
 * 이메일/비밀번호 입력, 회원가입 화면 링크 제공.
 * 로그인 성공 시 JWT를 sessionStorage에 저장하고 일정 생성 화면으로 이동한다.
 */
function LoginPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      const auth = await login(values);
      saveSession(auth);
      navigate('/trips/new', { replace: true });
    } catch (error) {
      setSubmitError(
        extractErrorMessage(error, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
      );
    }
  };

  return (
    <Container maxWidth="xs" sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center' }}>
      <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1" sx={{ textAlign: 'center' }}>
            로그인
          </Typography>

          {submitError && <Alert severity="error">{submitError}</Alert>}

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
                autoComplete="current-password"
                fullWidth
                error={!!errors.password}
                helperText={errors.password?.message}
                {...register('password')}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={isSubmitting}
              >
                로그인
              </Button>
            </Stack>
          </Box>

          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            계정이 없으신가요?{' '}
            <Link component={RouterLink} to="/signup">
              회원가입
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}

export default LoginPage;
