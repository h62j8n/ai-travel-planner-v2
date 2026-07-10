import { createBrowserRouter, Navigate } from 'react-router-dom';

import AppLayout from '../components/layout/AppLayout';
import AdminLayout from '../components/layout/AdminLayout';
import TripCreatePage from '../pages/TripCreatePage';
import TripItineraryPage from '../pages/TripItineraryPage';
import SavedTripsPage from '../pages/SavedTripsPage';
import LoginPage from '../pages/auth/LoginPage';
import SignupPage from '../pages/auth/SignupPage';
import AdminLoginPage from '../pages/auth/AdminLoginPage';
import QualityMonitoringPage from '../pages/admin/QualityMonitoringPage';
import DestinationStatsPage from '../pages/admin/DestinationStatsPage';
import PromptTemplatesPage from '../pages/admin/PromptTemplatesPage';
import RequireAuth from './RequireAuth';
import RequireAdmin from './RequireAdmin';

/**
 * 라우팅 구성.
 * - `/trips/*`: 로그인 필요 (RequireAuth) — 미로그인 시 /login으로 리다이렉트.
 * - `/admin/*`(단, /admin/login 제외): 로그인 + role=admin 필요 (RequireAdmin).
 *   미로그인 시 /admin/login으로, role 불일치 시 안내 후 /trips/new로 리다이렉트.
 * 경로는 PRD 9절 API 계약의 리소스 명칭과 맞춰 두었다.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/trips/new" replace /> },
          { path: 'trips/new', element: <TripCreatePage /> },
          { path: 'trips', element: <SavedTripsPage /> },
          { path: 'trips/:tripId', element: <TripItineraryPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/flagged-trips" replace /> },
          { path: 'flagged-trips', element: <QualityMonitoringPage /> },
          { path: 'destinations', element: <DestinationStatsPage /> },
          { path: 'prompt-templates', element: <PromptTemplatesPage /> },
        ],
      },
    ],
  },
]);

export default router;
