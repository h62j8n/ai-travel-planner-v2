import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { login, extractErrorMessage } from '../../api/authApi';
import { saveSession } from '../../auth/authStorage';
import { loginSchema, type LoginFormValues } from '../../auth/authSchemas';

/**
 * 관리자 전용 로그인 화면 (PRD 6.1, /admin/login).
 * 백엔드에 관리자 전용 로그인 API가 별도로 있지 않으므로 일반 로그인과 동일한
 * POST /auth/login 을 그대로 사용하되, 응답의 user.role이 'admin'이 아니면
 * 세션을 저장하지 않고 접근을 거부한다 (관리자 계정은 셀프 회원가입 대상이 아니므로
 * 이 화면에는 회원가입 링크를 두지 않는다).
 */
function AdminLoginPage() {
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
      if (auth.user.role !== 'admin') {
        setSubmitError('관리자 계정이 아닙니다. 일반 로그인 화면을 이용해 주세요.');
        return;
      }
      saveSession(auth);
      navigate('/admin', { replace: true });
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
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h5" component="h1">
              관리자 로그인
            </Typography>
            <Chip label="ADMIN" color="secondary" size="small" />
          </Stack>

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
                color="secondary"
                size="large"
                fullWidth
                disabled={isSubmitting}
              >
                관리자 로그인
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

export default AdminLoginPage;
