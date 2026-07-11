import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';

import { logout as logoutRequest } from '../../api/authApi';
import { clearSession, getStoredUser } from '../../auth/authStorage';

/**
 * 공통 레이아웃 (와이어프레임의 appbar 영역에 대응).
 * 로그인 상태(이메일)를 표시하고, 로그아웃 시 sessionStorage를 비운 뒤 /login으로 이동한다.
 */
function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // 서버 로그아웃 호출이 실패하더라도 클라이언트 세션은 반드시 정리한다.
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AI 여행 플래너
          </Typography>
          {user && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Button color="inherit" onClick={() => navigate('/trips')}>
                저장한 여행
              </Button>
              <Typography variant="body2">{user.email}</Typography>
              <Button color="inherit" onClick={handleLogout}>
                로그아웃
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flex: 1, py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

export default AppLayout;
