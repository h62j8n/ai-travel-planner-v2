import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../api/authApi';
import { getTrip, regenerateDayActivities, regenerateTrip, reorderTrip } from '../api/tripApi';
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
 * 일정 생성/재조정 직후에는 navigate state로 넘겨준 Trip 객체를 그대로 표시하고,
 * 저장 목록 카드 클릭이나 새로고침/직접 URL 접근처럼 state가 없는 경우에는
 * GET /trips/:id로 상세를 조회한다. 조회 실패(404/403 등)면 안내 화면을 보여준다.
 *
 * "결과 표시 + 같은 day 내 드래그 순서 변경(로컬)" + "재조정 요청(PATCH /trips/{id}/reorder)"까지 다룬다.
 * 드래그는 로컬 상태만 바꾸고, 실제 서버 재조정은 day별 버튼 클릭 시에만 호출한다(비용/UX상 명시적 트리거).
 */
function TripItineraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const initialTrip = (location.state as TripLocationState | null)?.trip;

  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [loadingTrip, setLoadingTrip] = useState(!initialTrip);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDays, setPendingDays] = useState<ReadonlySet<number>>(new Set());
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [regeneratingTrip, setRegeneratingTrip] = useState(false);
  const [regenerateTripDialogOpen, setRegenerateTripDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // navigate state로 받은 trip이 없을 때만(목록 카드 클릭, 새로고침 등) GET /trips/:id로 조회한다.
  useEffect(() => {
    if (initialTrip || !tripId) {
      return;
    }
    let cancelled = false;
    setLoadingTrip(true);
    getTrip(tripId)
      .then((fetched) => {
        if (!cancelled) setTrip(fetched);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            extractErrorMessage(error, '일정 정보를 불러오지 못했습니다.'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTrip(false);
      });
    return () => {
      cancelled = true;
    };
    // initialTrip은 최초 렌더 기준으로만 판단하면 되므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (loadingTrip) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'center', mt: 6 }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">
          일정을 불러오는 중...
        </Typography>
      </Stack>
    );
  }

  if (!trip) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography variant="h6">일정 정보를 찾을 수 없습니다</Typography>
        <Typography variant="body2" color="text.secondary">
          {loadError ??
            '새로고침했거나 잘못된 경로로 접근한 경우 일정 데이터가 남아있지 않아요. 새 일정을 만들어 주세요.'}
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

  // day별 "활동 재생성" 확인 다이얼로그에서 최종 확인 시 호출된다(PRD 6.3.2).
  // 응답은 Trip 전체이며 해당 day만 last_modified:true로 교체되고 다른 day는 서버가 그대로 유지해
  // 반환하므로, reorder와 동일하게 응답을 그대로 신뢰해 로컬 trip state 전체를 교체한다.
  const handleRequestRegenerateDay = async (dayNumber: number) => {
    if (!trip) return;

    setRegeneratingDay(dayNumber);
    try {
      const updatedTrip = await regenerateDayActivities(trip.trip_id, dayNumber);
      setTrip(updatedTrip);
      setPendingDays((prev) => {
        if (!prev.has(dayNumber)) return prev;
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setToast({
        message: `Day ${dayNumber} 활동을 새로 생성했어요 (revision ${updatedTrip.meta.revision})`,
        severity: 'success',
      });
    } catch (error) {
      setToast({
        message: extractErrorMessage(
          error,
          '활동 재생성 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        ),
        severity: 'error',
      });
    } finally {
      setRegeneratingDay(null);
    }
  };

  // 헤더 "전체 재생성" 확인 다이얼로그에서 최종 확인 시 호출된다(PRD 6.2.2).
  // 입력 조건은 서버가 원본 trip 기준으로 유지하고 AI만 새로 호출하며(캐시 무시),
  // 응답은 **새로운** trip_id를 가진 별도 Trip이다. 기존 trip은 저장 목록에 그대로 남으므로
  // 새 trip_id로 일정표 화면을 다시 진입시킨다(TripCreatePage의 성공 후 navigate 패턴과 동일).
  const handleRegenerateTrip = async () => {
    if (!trip) return;

    setRegeneratingTrip(true);
    try {
      const newTrip = await regenerateTrip(trip.trip_id);
      navigate(`/trips/${newTrip.trip_id}`, { state: { trip: newTrip } });
    } catch (error) {
      setToast({
        message: extractErrorMessage(
          error,
          '일정 전체 재생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        ),
        severity: 'error',
      });
    } finally {
      setRegeneratingTrip(false);
    }
  };

  const isAnyActionInProgress =
    reorderingDay !== null || regeneratingDay !== null || regeneratingTrip;

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
            {trip.preferences.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 1, rowGap: 0.5, flexWrap: 'wrap' }}>
                {trip.preferences.map((preference) => (
                  <Chip key={preference} label={preference} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="error"
              disabled={isAnyActionInProgress}
              startIcon={
                regeneratingTrip ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AutorenewIcon fontSize="small" />
                )
              }
              onClick={() => setRegenerateTripDialogOpen(true)}
            >
              전체 재생성
            </Button>
            <Button variant="outlined" onClick={() => navigate('/trips')}>
              목록으로
            </Button>
          </Stack>
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
              onRequestRegenerateDay={handleRequestRegenerateDay}
              isRegeneratingDay={regeneratingDay === day.day}
              disableActions={
                isAnyActionInProgress &&
                reorderingDay !== day.day &&
                regeneratingDay !== day.day
              }
            />
          </Grid>
        ))}
      </Grid>

      <Dialog
        open={regenerateTripDialogOpen}
        onClose={() => setRegenerateTripDialogOpen(false)}
        aria-labelledby="regenerate-trip-dialog-title"
      >
        <DialogTitle id="regenerate-trip-dialog-title">일정 전체를 재생성할까요?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            목적지·기간·예산·취향 등 입력 조건은 유지한 채 AI가 완전히 새로운 일정을 만들어요.
            현재 일정은 저장 목록에 그대로 유지되고, 새 일정이 별도로 생성됩니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateTripDialogOpen(false)}>취소</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setRegenerateTripDialogOpen(false);
              handleRegenerateTrip();
            }}
          >
            재생성
          </Button>
        </DialogActions>
      </Dialog>

      <Backdrop
        open={reorderingDay !== null || regeneratingDay !== null || regeneratingTrip}
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography variant="body2">
            {regeneratingTrip
              ? 'AI가 새로운 일정을 생성하는 중...'
              : regeneratingDay !== null
                ? `AI가 Day ${regeneratingDay} 활동을 새로 생성하는 중...`
                : 'AI가 동선을 재조정하는 중...'}
          </Typography>
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
