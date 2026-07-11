import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../api/authApi';
import { reorderTrip } from '../api/tripApi';
import DayCard from '../components/trip/DayCard';
import type { Activity, Trip } from '../types/trip';

interface TripLocationState {
  trip?: Trip;
}

interface ToastState {
  message: string;
  severity: 'success' | 'error';
}

/**
 * 일정표 (사용자)
 * PRD 6.3, 6.5, 8.3, 11절 / docs/wireframe/일정표_와이어프레임.html 참고
 *
 * 현재 백엔드에는 GET /trips/:id 단건 조회가 없으므로, 일정 생성 직후
 * TripCreatePage가 navigate state로 넘겨준 Trip 객체를 그대로 표시한다.
 * 새로고침/직접 URL 접근 등으로 state가 없으면 안내 화면을 보여준다.
 *
 * "결과 표시 + 같은 day 내 드래그 순서 변경(로컬)" + "재조정 요청(PATCH /trips/{id}/reorder)"까지 다룬다.
 * 드래그는 로컬 상태만 바꾸고, 실제 서버 재조정은 day별 버튼 클릭 시에만 호출한다(비용/UX상 명시적 트리거).
 */
function TripItineraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTrip = (location.state as TripLocationState | null)?.trip;

  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [pendingDays, setPendingDays] = useState<ReadonlySet<number>>(new Set());
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  if (!trip) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography variant="h6">일정 정보를 찾을 수 없습니다</Typography>
        <Typography variant="body2" color="text.secondary">
          새로고침했거나 잘못된 경로로 접근한 경우 일정 데이터가 남아있지 않아요. 새 일정을
          만들어 주세요.
        </Typography>
        <Button variant="contained" color="secondary" onClick={() => navigate('/trips/new')}>
          새 일정 만들기로 이동
        </Button>
      </Stack>
    );
  }

  // route_warning.flagged=true인 day가 있어도 활동 순서는 사용자가 정한 그대로 유지한다 (자동 재배열 금지).
  // 드래그로 순서를 바꾸면 해당 day의 activities만 교체하고, 다른 day는 절대 건드리지 않는다.
  const handleReorder = (dayNumber: number, activities: Activity[]) => {
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((day) =>
          day.day === dayNumber ? { ...day, activities } : day,
        ),
      };
    });
    setPendingDays((prev) => {
      const next = new Set(prev);
      next.add(dayNumber);
      return next;
    });
  };

  // "재조정 요청" / "동선 최적화 재요청" 버튼 클릭 시에만 서버로 PATCH를 보낸다.
  // 변경 요청한 day와 new_activity_order만 보내고, 응답으로 받은 Trip 전체(다른 day 포함)를 그대로 신뢰해 교체한다.
  const handleRequestReorder = async (dayNumber: number, activities: Activity[]) => {
    if (!trip) return;

    setReorderingDay(dayNumber);
    try {
      const newActivityOrder = activities.map((activity) => activity.id);
      const updatedTrip = await reorderTrip(trip.trip_id, dayNumber, newActivityOrder);
      setTrip(updatedTrip);
      setPendingDays((prev) => {
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setToast({
        message: `Day ${dayNumber} 재조정 완료 (revision ${updatedTrip.meta.revision})`,
        severity: 'success',
      });
    } catch (error) {
      // 실패 시 pendingDays는 그대로 유지해 재시도할 수 있게 한다.
      setToast({
        message: extractErrorMessage(
          error,
          '동선 재조정 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        ),
        severity: 'error',
      });
    } finally {
      setReorderingDay(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
        >
          <Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Typography variant="h5" component="h1">
                {trip.destination}
              </Typography>
              <Chip label={`revision ${trip.meta.revision}`} size="small" color="primary" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {trip.duration_days}일 일정
            </Typography>
            {trip.summary && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {trip.summary}
              </Typography>
            )}
          </Box>
          <Button variant="outlined" onClick={() => navigate('/trips')}>
            목록으로
          </Button>
        </Stack>
      </Paper>

      {pendingDays.size > 0 && (
        <Alert severity="info">
          순서를 변경한 날짜가 있어요. 각 카드의 "재조정 요청" 버튼을 눌러 AI에게 반영해 주세요.
        </Alert>
      )}

      <Grid container spacing={2}>
        {trip.days.map((day) => (
          <Grid key={day.day} size={{ xs: 12, md: 6, lg: 4 }}>
            <DayCard
              day={day}
              pending={pendingDays.has(day.day)}
              onReorder={handleReorder}
              onRequestReorder={handleRequestReorder}
              isReordering={reorderingDay === day.day}
            />
          </Grid>
        ))}
      </Grid>

      <Backdrop
        open={reorderingDay !== null}
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography variant="body2">AI가 동선을 재조정하는 중...</Typography>
        </Stack>
      </Backdrop>

      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}

export default TripItineraryPage;
