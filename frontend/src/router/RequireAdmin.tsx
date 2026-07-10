import { useEffect } from 'react';
import { Alert, Container, Stack } from '@mui/material';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';

import { getStoredUser, isAuthenticated } from '../auth/authStorage';

const ACCESS_DENIED_REDIRECT_DELAY_MS = 2000;

/**
 * `/admin/*` (단, /admin/login 제외) 라우트 그룹 가드.
 * - 로그인하지 않은 경우: /admin/login 으로 리다이렉트.
 * - 로그인은 했지만 role이 admin이 아닌 경우: 관리자 API가 403을 반환하는 것과 동일한
 *   맥락으로, 접근 거부 안내(Alert)를 노출한 뒤 /trips/new 로 이동시킨다.
 */
function RequireAdmin() {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const user = getStoredUser();
  const isAdmin = authenticated && user?.role === 'admin';
  const showAccessDenied = authenticated && !isAdmin;

  useEffect(() => {
    if (!showAccessDenied) return;

    const timer = setTimeout(() => {
      navigate('/trips/new', { replace: true });
    }, ACCESS_DENIED_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [showAccessDenied, navigate]);

  if (!authenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  if (showAccessDenied) {
    return (
      <Container maxWidth="sm" sx={{ pt: 8 }}>
        <Stack spacing={2}>
          <Alert severity="error">
            관리자 권한이 없는 계정입니다. 잠시 후 일정 생성 화면으로 이동합니다.
          </Alert>
        </Stack>
      </Container>
    );
  }

  return <Outlet />;
}

export default RequireAdmin;
