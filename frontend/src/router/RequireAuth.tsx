import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { isAuthenticated } from '../auth/authStorage';

/**
 * `/trips/*` 등 로그인이 필요한 라우트 그룹 가드.
 * 로그인하지 않은 경우 /login으로 리다이렉트한다.
 */
function RequireAuth() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
