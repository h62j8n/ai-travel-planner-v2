import { createBrowserRouter, Navigate } from 'react-router-dom';

import AppLayout from '../components/layout/AppLayout';
import AdminLayout from '../components/layout/AdminLayout';
import TripCreatePage from '../pages/TripCreatePage';
import TripItineraryPage from '../pages/TripItineraryPage';
import SavedTripsPage from '../pages/SavedTripsPage';
import QualityMonitoringPage from '../pages/admin/QualityMonitoringPage';
import DestinationStatsPage from '../pages/admin/DestinationStatsPage';
import PromptTemplatesPage from '../pages/admin/PromptTemplatesPage';

/**
 * 라우팅 스켈레톤.
 * 인증/인가 가드(로그인 필요, admin 전용 등)는 PRD 6.1/6.6 구현 단계에서 추가한다.
 * 경로는 PRD 9절 API 계약의 리소스 명칭과 맞춰 두었다.
 */
const router = createBrowserRouter([
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
]);

export default router;
