import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material';

import DayCard from '../components/trip/DayCard';
import type { Activity, Trip } from '../types/trip';

interface TripLocationState {
  trip?: Trip;
}

/**
 * 일정표 (사용자)
 * PRD 6.3, 6.5, 8.3, 11절 / docs/wireframe/일정표_와이어프레임.html 참고
 *
 * 현재 백엔드에는 GET /trips/:id 단건 조회가 없으므로, 일정 생성 직후
 * TripCreatePage가 navigate state로 넘겨준 Trip 객체를 그대로 표시한다.
 * 새로고침/직접 URL 접근 등으로 state가 없으면 안내 화면을 보여준다.
 *
 * 이 화면은 "결과 표시 + 같은 day 내 드래그 순서 변경"까지만 다룬다.
 * 재조정 요청(PATCH /trips/{id}/reorder) 연동은 다음 단계 작업 범위다.
 */
function TripItineraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTrip = (location.state as TripLocationState | null)?.trip;

  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [pendingDays, setPendingDays] = useState<ReadonlySet<number>>(new Set());

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
          순서를 변경한 날짜가 있어요. 재조정 요청 기능은 다음 단계에서 제공될 예정입니다.
        </Alert>
      )}

      <Grid container spacing={2}>
        {trip.days.map((day) => (
          <Grid key={day.day} size={{ xs: 12, md: 6, lg: 4 }}>
            <DayCard day={day} pending={pendingDays.has(day.day)} onReorder={handleReorder} />
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

export default TripItineraryPage;
