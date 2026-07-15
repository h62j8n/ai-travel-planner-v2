import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../api/authApi';
import {
  getTrip,
  regenerateDayActivities,
  regenerateTrip,
  reorderTrip,
  saveRegeneratedTrip,
  saveTripAdjustments,
} from '../api/tripApi';
import ItineraryBoard from '../components/trip/ItineraryBoard';
import type { Activity, Trip, TripDay } from '../types/trip';

interface TripLocationState {
  trip?: Trip;
}

interface ToastState {
  message: string;
  severity: 'success' | 'error';
}

/**
 * 일정표 — 저장된 일정(trip_id 기반) 모드.
 * PRD 6.2.2, 6.2.3, 6.3, 6.4, 8.2, 8.3, 9절 / docs/wireframe/일정표_와이어프레임.html 참고
 *
 * v2.6부터 저장 목록에서 다시 연 trip도 임시(draft) 화면과 동일하게 "AI 호출 -> 미리보기 ->
 * 명시적 저장" 흐름을 따른다. reorder/regenerate-day/regenerate(전체 재생성) 세 액션 모두
 * AI 호출 결과를 로컬 상태에만 반영할 뿐 DB에는 저장하지 않으며, 화면 상단 "저장" 버튼을
 * 눌러야 비로소 커밋된다.
 * - day 단위 조정(reorder/regenerate-day) 미리보기가 하나라도 쌓여 있으면 저장 시 같은
 *   trip_id를 유지한 채 POST /trips/{tripId}/save로 커밋(revision 1 증가).
 * - 전체 재생성 미리보기가 떠 있으면 저장 시 항상 POST /trips/{tripId}/regenerate/save로
 *   새로운 trip_id를 발급(원본은 그대로 유지, v1/v2 비교 가능).
 *
 * 일정 생성/재조정 직후에는 navigate state로 넘겨준 Trip 객체를 그대로 표시하고,
 * 저장 목록 카드 클릭이나 새로고침/직접 URL 접근처럼 state가 없는 경우에는
 * GET /trips/:id로 상세를 조회한다. 조회 실패(404/403 등)면 안내 화면을 보여준다.
 *
 * 드래그는 로컬 상태만 바꾸고, 실제 AI 호출(미리보기)은 day별 버튼 클릭 시에만 호출한다(비용/UX상 명시적 트리거).
 */
function TripItineraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const initialTrip = (location.state as TripLocationState | null)?.trip;

  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  // 로컬 작업 사본. 초기값은 trip.days이며, reorder/regenerate-day 미리보기 응답으로
  // 대상 day만 교체되거나 전체 재생성 미리보기로 통째로 교체된다.
  const [days, setDays] = useState<TripDay[] | undefined>(initialTrip?.days);
  // 전체 재생성 미리보기가 로컬 days/summary에 반영돼 있을 때의 summary(초기값은 trip.summary).
  const [summary, setSummary] = useState<string | null | undefined>(initialTrip?.summary);
  const [loadingTrip, setLoadingTrip] = useState(!initialTrip);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 드래그했지만 아직 "재조정 요청" 버튼을 누르지 않은 day (AI 미호출 상태).
  const [pendingDays, setPendingDays] = useState<ReadonlySet<number>>(new Set());
  // reorder/regenerate-day 미리보기가 성공해 로컬에 반영됐지만 아직 "저장"을 누르지 않은 day.
  const [unsavedDays, setUnsavedDays] = useState<ReadonlySet<number>>(new Set());
  // "전체 재생성" 미리보기가 현재 화면에 떠 있는 상태인지(true면 저장 시 항상 새 trip_id로 커밋).
  const [pendingFullRegenerate, setPendingFullRegenerate] = useState(false);
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [regeneratingTrip, setRegeneratingTrip] = useState(false);
  const [saving, setSaving] = useState(false);
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
        if (!cancelled) {
          setTrip(fetched);
          setDays(fetched.days);
          setSummary(fetched.summary);
        }
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

  if (!trip || !days) {
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
    setDays((prev) =>
      prev?.map((day) => (day.day === dayNumber ? { ...day, activities } : day)),
    );
    setPendingDays((prev) => {
      const next = new Set(prev);
      next.add(dayNumber);
      return next;
    });
  };

  // "재조정 요청" / "동선 최적화 재요청" 버튼 클릭 시에만 서버로 PATCH를 보낸다(미리보기, DB 미반영).
  // 변경 요청한 day와 new_activity_order, 현재 화면의 로컬 days 전체를 함께 보내고,
  // 응답으로 받은 days 전체(대상 day만 재계산, 나머지는 relay된 것)를 그대로 신뢰해 교체한다.
  const handleRequestReorder = async (dayNumber: number, activities: Activity[]) => {
    if (!trip || !days) return;

    setReorderingDay(dayNumber);
    try {
      const newActivityOrder = activities.map((activity) => activity.id);
      const currentDays = days.map((day) =>
        day.day === dayNumber ? { ...day, activities } : day,
      );
      const previewTrip = await reorderTrip(trip.trip_id, dayNumber, newActivityOrder, currentDays);
      setDays(previewTrip.days);
      setPendingDays((prev) => {
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setUnsavedDays((prev) => {
        const next = new Set(prev);
        next.add(dayNumber);
        return next;
      });
      setToast({
        message: `Day ${dayNumber} 재조정 미리보기가 준비됐어요. "저장"을 눌러야 반영됩니다.`,
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

  // day별 "활동 재생성" 확인 다이얼로그에서 최종 확인 시 호출된다(PRD 6.3.2, 미리보기).
  // 응답은 대상 day만 재계산되고 나머지 day는 요청받은 days 그대로 relay되므로,
  // reorder와 동일하게 응답을 그대로 신뢰해 로컬 days state 전체를 교체한다.
  const handleRequestRegenerateDay = async (dayNumber: number) => {
    if (!trip || !days) return;

    setRegeneratingDay(dayNumber);
    try {
      const previewTrip = await regenerateDayActivities(trip.trip_id, dayNumber, days);
      setDays(previewTrip.days);
      setPendingDays((prev) => {
        if (!prev.has(dayNumber)) return prev;
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setUnsavedDays((prev) => {
        const next = new Set(prev);
        next.add(dayNumber);
        return next;
      });
      setToast({
        message: `Day ${dayNumber} 활동 재생성 미리보기가 준비됐어요. "저장"을 눌러야 반영됩니다.`,
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

  // 헤더 "전체 재생성" 확인 다이얼로그에서 최종 확인 시 호출된다(PRD 6.2.3).
  // 입력 조건은 서버가 원본 trip 기준으로 유지하고 AI만 새로 호출하며(캐시 무시),
  // 응답은 trip_id가 없는 TempTrip(미리보기)이다. DB에는 반영되지 않으므로 페이지 이동 없이
  // 로컬 days/summary를 통째로 교체하고, day 단위 미리보기 상태는 모두 초기화한다
  // (전체가 새로 교체됐으므로 이전 day별 unsaved/pending 상태는 의미가 없어진다).
  const handleRegenerateTrip = async () => {
    if (!trip) return;

    setRegeneratingTrip(true);
    try {
      const previewTrip = await regenerateTrip(trip.trip_id);
      setDays(previewTrip.days);
      setSummary(previewTrip.summary);
      setPendingFullRegenerate(true);
      setPendingDays(new Set());
      setUnsavedDays(new Set());
      setToast({
        message: '새로운 일정 미리보기가 준비됐어요. "저장"을 누르면 새 일정으로 저장됩니다.',
        severity: 'success',
      });
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

  // "저장" 버튼(PRD 6.2.2, 11절): 전체 재생성 미리보기가 떠 있으면 항상 새 trip_id로 커밋하고,
  // 그렇지 않으면(day 단위 조정만 있는 경우) 같은 trip_id를 유지한 채 커밋한다.
  const handleSave = async () => {
    if (!trip || !days) return;

    setSaving(true);
    try {
      if (pendingFullRegenerate) {
        const newTrip = await saveRegeneratedTrip(trip.trip_id, summary ?? null, days);
        navigate(`/trips/${newTrip.trip_id}`, { state: { trip: newTrip } });
        return;
      }

      const savedTrip = await saveTripAdjustments(trip.trip_id, days);
      setTrip(savedTrip);
      setDays(savedTrip.days);
      setSummary(savedTrip.summary);
      setUnsavedDays(new Set());
      setToast({
        message: `일정을 저장했어요 (revision ${savedTrip.meta.revision})`,
        severity: 'success',
      });
    } catch (error) {
      setToast({
        message: extractErrorMessage(error, '일정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const otherActionInProgress = regeneratingTrip || saving;
  const hasUnsavedChanges = unsavedDays.size > 0 || pendingFullRegenerate;

  return (
    <>
      <ItineraryBoard
        destination={trip.destination}
        durationDays={trip.duration_days}
        summary={summary ?? null}
        preferences={trip.preferences}
        days={days}
        revisionLabel={`revision ${trip.meta.revision}`}
        pendingDays={pendingDays}
        unsavedDays={unsavedDays}
        reorderingDay={reorderingDay}
        onReorder={handleReorder}
        onRequestReorder={handleRequestReorder}
        regeneratingDay={regeneratingDay}
        onRequestRegenerateDay={handleRequestRegenerateDay}
        otherActionInProgress={otherActionInProgress}
        backdropOpen={reorderingDay !== null || regeneratingDay !== null || otherActionInProgress}
        backdropLabel={
          saving
            ? '일정을 저장하는 중...'
            : regeneratingTrip
              ? 'AI가 새로운 일정을 생성하는 중...'
              : regeneratingDay !== null
                ? `AI가 Day ${regeneratingDay} 활동을 새로 생성하는 중...`
                : 'AI가 동선을 재조정하는 중...'
        }
        headerActions={
          <>
            <Button
              variant="outlined"
              color="error"
              disabled={reorderingDay !== null || regeneratingDay !== null || otherActionInProgress}
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
            {hasUnsavedChanges && (
              <Button
                variant="contained"
                color="secondary"
                disabled={reorderingDay !== null || regeneratingDay !== null || otherActionInProgress}
                startIcon={
                  saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon fontSize="small" />
                }
                onClick={handleSave}
              >
                저장
              </Button>
            )}
            <Button variant="outlined" onClick={() => navigate('/trips')}>
              목록으로
            </Button>
          </>
        }
      />

      <Dialog
        open={regenerateTripDialogOpen}
        onClose={() => setRegenerateTripDialogOpen(false)}
        aria-labelledby="regenerate-trip-dialog-title"
      >
        <DialogTitle id="regenerate-trip-dialog-title">일정 전체를 재생성할까요?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            목적지·기간·예산·취향 등 입력 조건은 유지한 채 AI가 완전히 새로운 일정을 만들어요.
            결과는 미리보기로만 반영되고, 저장 전까지 지금 저장돼 있는 일정은 전혀 바뀌지 않습니다.
            마음에 들면 "저장"을 눌러야 새 일정으로 저장돼요(현재 일정은 그대로 유지되고 별도로
            생성됩니다).
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
    </>
  );
}

export default TripItineraryPage;
