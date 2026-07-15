import LogoutIcon from '@mui/icons-material/Logout';
import {
  AppBar,
  Box,
  Chip,
  Container,
  IconButton,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { logout as logoutRequest } from '../../api/authApi';
import { clearSession } from '../../auth/authStorage';

const NAV_TABS = [
  { value: '/admin/flagged-trips', label: '품질 모니터링' },
  { value: '/admin/destinations', label: '인기 목적지 통계' },
  { value: '/admin/prompt-templates', label: '프롬프트 템플릿 관리' },
] as const;

/**
 * 현재 경로에 대응하는 nav 탭 값을 찾는다.
 * `/admin/flagged/:tripId` 같은 하위 상세 경로는 '품질 모니터링' 탭을 그대로 활성 표시한다.
 */
function resolveActiveTab(pathname: string): string | false {
  if (pathname.startsWith('/admin/flagged')) return '/admin/flagged-trips';
  const matched = NAV_TABS.find((tab) => pathname.startsWith(tab.value));
  return matched ? matched.value : false;
}

/**
 * 관리자 화면 공통 레이아웃 (docs/wireframe/관리자_*_와이어프레임.html의 admin appbar에 대응).
 * 품질 모니터링 / 인기 목적지 통계 / 프롬프트 템플릿 관리 3개 화면을 탭으로 오가고,
 * 로그아웃 시 sessionStorage를 비운 뒤 /admin/login으로 이동한다.
 * role=admin 여부 가드는 RequireAdmin(router 레벨)에서 이미 처리하므로 여기서는 다루지 않는다.
 */
function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = resolveActiveTab(location.pathname);

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // 서버 로그아웃 호출이 실패하더라도 클라이언트 세션은 반드시 정리한다.
    } finally {
      clearSession();
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            AI 여행 플래너
            <Chip label="ADMIN" color="secondary" size="small" />
          </Typography>

          <Tabs
            value={activeTab}
            textColor="inherit"
            indicatorColor="secondary"
            sx={{ flexGrow: 1, minHeight: 0 }}
          >
            {NAV_TABS.map((tab) => (
              <Tab
                key={tab.value}
                value={tab.value}
                label={tab.label}
                onClick={() => navigate(tab.value)}
                sx={{ minHeight: 0, py: 2 }}
              />
            ))}
          </Tabs>

          <Tooltip title="로그아웃">
            <IconButton color="inherit" aria-label="로그아웃" onClick={handleLogout}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flex: 1, py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

export default AdminLayout;
