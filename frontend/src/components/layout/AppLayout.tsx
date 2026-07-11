import { useState } from 'react';

import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';

import { logout as logoutRequest } from '../../api/authApi';
import { clearSession, getStoredUser } from '../../auth/authStorage';

/**
 * 공통 레이아웃 (와이어프레임의 appbar 영역에 대응).
 * 로그인 상태(이메일)를 표시하고, 로그아웃 시 sessionStorage를 비운 뒤 /login으로 이동한다.
 * 데스크톱에서는 nav 텍스트 링크 + 이메일 + 로그아웃 아이콘을 상시 노출하고,
 * 모바일(sm 미만)에서는 햄버거 메뉴로 동일한 항목을 묶어서 노출한다.
 */
function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchor);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    handleMenuClose();
  };

  const handleLogout = async () => {
    handleMenuClose();
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
            <>
              {/* 데스크톱: nav 텍스트 링크 + 이메일 + 로그아웃 아이콘 상시 노출 */}
              <Stack
                direction="row"
                spacing={2}
                sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}
              >
                <Button color="inherit" onClick={() => navigate('/trips/new')}>
                  새 일정 만들기
                </Button>
                <Button color="inherit" onClick={() => navigate('/trips')}>
                  저장한 여행
                </Button>
                <Typography variant="body2">{user.email}</Typography>
                <Tooltip title="로그아웃">
                  <IconButton
                    color="inherit"
                    aria-label="로그아웃"
                    onClick={handleLogout}
                  >
                    <LogoutIcon />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* 모바일: 햄버거 메뉴로 nav/이메일/로그아웃을 묶어서 노출 */}
              <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
                <IconButton
                  color="inherit"
                  aria-label="메뉴 열기"
                  onClick={handleMenuOpen}
                >
                  <MenuIcon />
                </IconButton>
                <Menu anchorEl={menuAnchor} open={isMenuOpen} onClose={handleMenuClose}>
                  <MenuItem onClick={() => handleNavigate('/trips/new')}>새 일정 만들기</MenuItem>
                  <MenuItem onClick={() => handleNavigate('/trips')}>저장한 여행</MenuItem>
                  <Divider />
                  <MenuItem disabled>{user.email}</MenuItem>
                  <MenuItem onClick={handleLogout}>로그아웃</MenuItem>
                </Menu>
              </Box>
            </>
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
