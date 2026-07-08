import { AppBar, Box, Chip, Container, Toolbar, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';

/**
 * 관리자 화면 공통 레이아웃 스켈레톤 (와이어프레임의 admin appbar 영역에 대응).
 * 실제 관리자 인가 체크/네비게이션은 인증 구현 단계에서 추가한다.
 */
function AdminLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AI 여행 플래너
          </Typography>
          <Chip label="ADMIN" color="secondary" size="small" />
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flex: 1, py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

export default AdminLayout;
