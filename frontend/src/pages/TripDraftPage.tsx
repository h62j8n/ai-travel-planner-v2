import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Button,
  Chip,
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
import { regenerateDayDraft, regenerateTripDraft, reorderTripDraft, saveTrip } from '../api/tripApi';
import ItineraryBoard from '../components/trip/ItineraryBoard';
import type { Activity, DraftTrip, TripCreateInput } from '../types/trip';

interface DraftLocationState {
  draft?: DraftTrip;
}

interface ToastState {
  message: string;
  severity: 'success' | 'error';
}

/** DraftTrip에서 서버가 매 요청마다 필요로 하는 8.1 입력값만 추려낸다(PRD 8.2 공통 바디). */
function toTripCreateInput(draft: DraftTrip): TripCreateInput {
  const {
    destination,
    start_date,
    end_date,
    budget_level,
    activity_time_start,
    activity_time_end,
    companion,
    preferences,
  } = draft;
  return {
    destination,
    start_date,
    end_date,
    budget_level,
    activity_time_start,
    activity_time_end,
    companion,
    preferences,
  };
}

/** reorder/regenerate-day/저장 요청 공통 바디(입력값 전체 + summary + 현재 days). */
function toDraftAdjustBase(draft: DraftTrip) {
  return { ...toTripCreateInput(draft), summary: draft.summary, days: draft.days };
}

/**
 * 일정표 — 임시(draft, 저장 전) 모드.
 * PRD 6.2.1~6.2.3, 6.3, 8.2, 11절.
 *
 * /trips/draft 경로로만 진입하며 trip_id가 없으므로 GET 폴백이 불가능하다 — TripCreatePage가
 * navigate state로 넘겨준 draft가 없으면(새로고침/직접 URL 접근 등) 새 일정 만들기로 안내한다.
 * 여기서의 모든 조정(드래그 재조정/day 재생성/전체 재생성)은 AI만 호출할 뿐 DB에는 저장되지 않고,
 * "저장" 버튼을 눌러야만 비로소 POST /trips로 영속화된다(PRD 6.2.2, DoD 13절: 새로고침/이탈 시
 * 임시 일정이 사라져도 정상).
 */
function TripDraftPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialDraft = (location.state as DraftLocationState | null)?.draft;

  const [draft, setDraft] = useState<DraftTrip | undefined>(initialDraft);
  const [pendingDays, setPendingDays] = useState<ReadonlySet<number>>(new Set());
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [regeneratingTrip, setRegeneratingTrip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerateTripDialogOpen, setRegenerateTripDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  if (!draft) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography variant="h6">임시 일정 정보를 찾을 수 없습니다</Typography>
        <Typography variant="body2" color="text.secondary">
          새로고침했거나 잘못된 경로로 접근한 경우 임시 일정은 저장 전이라 데이터가 남아있지
          않아요. 새 일정을 만들어 주세요.
        </Typography>
        <Button variant="contained" color="secondary" onClick={() => navigate('/trips/new')}>
          새 일정 만들기로 이동
        </Button>
      </Stack>
    );
  }

  // route_warning.flagged=true인 day가 있어도 활동 순서는 사용자가 정한 그대로 유지한다 (자동 재배열 금지).
  const handleReorder = (dayNumber: number, activities: Activity[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((day) => (day.day === dayNumber ? { ...day, activities } : day)),
      };
    });
    setPendingDays((prev) => {
      const next = new Set(prev);
      next.add(dayNumber);
      return next;
    });
  };

  // "재조정 요청" / "동선 최적화 재요청" 버튼 클릭 시에만 서버로 PATCH를 보낸다(임시, DB 저장 X).
  // 응답(TempTrip)에는 입력값 필드가 없으므로 summary/duration_days/days만 갱신하고, 나머지
  // 입력값(destination/기간/예산 등)은 로컬에 유지한다.
  const handleRequestReorder = async (dayNumber: number, activities: Activity[]) => {
    if (!draft) return;

    setReorderingDay(dayNumber);
    try {
      const newActivityOrder = activities.map((activity) => activity.id);
      const currentDraft: DraftTrip = {
        ...draft,
        days: draft.days.map((day) => (day.day === dayNumber ? { ...day, activities } : day)),
      };
      const response = await reorderTripDraft({
        ...toDraftAdjustBase(currentDraft),
        day: dayNumber,
        new_activity_order: newActivityOrder,
      });
      setDraft((prev) =>
        prev
          ? { ...prev, summary: response.summary, duration_days: response.duration_days, days: response.days }
          : prev,
      );
      setPendingDays((prev) => {
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setToast({ message: `Day ${dayNumber} 재조정 완료 (임시, 아직 저장되지 않음)`, severity: 'success' });
    } catch (error) {
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

  // day별 "활동 재생성" 확인 다이얼로그에서 최종 확인 시 호출된다(PRD 6.3.2, 임시 상태).
  const handleRequestRegenerateDay = async (dayNumber: number) => {
    if (!draft) return;

    setRegeneratingDay(dayNumber);
    try {
      const response = await regenerateDayDraft({
        ...toDraftAdjustBase(draft),
        day: dayNumber,
      });
      setDraft((prev) =>
        prev
          ? { ...prev, summary: response.summary, duration_days: response.duration_days, days: response.days }
          : prev,
      );
      setPendingDays((prev) => {
        if (!prev.has(dayNumber)) return prev;
        const next = new Set(prev);
        next.delete(dayNumber);
        return next;
      });
      setToast({
        message: `Day ${dayNumber} 활동을 새로 생성했어요 (임시, 아직 저장되지 않음)`,
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
  // 저장된 trip과 달리 새 trip_id가 없으므로(애초에 trip_id 자체가 없음) 페이지 이동 없이
  // 같은 draft를 응답으로 그대로 교체한다.
  const handleRegenerateTripDraft = async () => {
    if (!draft) return;

    setRegeneratingTrip(true);
    try {
      const response = await regenerateTripDraft(toTripCreateInput(draft));
      setDraft((prev) =>
        prev
          ? { ...prev, summary: response.summary, duration_days: response.duration_days, days: response.days }
          : prev,
      );
      setPendingDays(new Set());
      setToast({ message: '새로운 임시 일정을 생성했어요 (아직 저장되지 않음)', severity: 'success' });
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

  // "저장" 버튼(PRD 11절: 임시 상태일 때만 노출) — POST /trips로 현재 draft를 그대로 DB에 영속화한다.
  // 성공하면 trip_id가 생긴 저장 화면(/trips/:tripId)으로 자연스럽게 전환한다.
  const handleSave = async () => {
    if (!draft) return;

    setSaving(true);
    try {
      const savedTrip = await saveTrip(toDraftAdjustBase(draft));
      navigate(`/trips/${savedTrip.trip_id}`, { state: { trip: savedTrip } });
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

  return (
    <>
      <ItineraryBoard
        destination={draft.destination}
        durationDays={draft.duration_days}
        summary={draft.summary}
        preferences={draft.preferences}
        days={draft.days}
        extraTitleBadge={<Chip label="임시 (저장 전)" size="small" color="warning" variant="outlined" />}
        pendingDays={pendingDays}
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
          </>
        }
      />

      <Dialog
        open={regenerateTripDialogOpen}
        onClose={() => setRegenerateTripDialogOpen(false)}
        aria-labelledby="regenerate-draft-dialog-title"
      >
        <DialogTitle id="regenerate-draft-dialog-title">일정 전체를 재생성할까요?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            목적지·기간·예산·취향 등 입력 조건은 유지한 채 AI가 완전히 새로운 임시 일정을 만들어요.
            아직 저장 전이라 지금 보고 있는 임시 일정은 사라지고 새로 생성된 내용으로 교체됩니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateTripDialogOpen(false)}>취소</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setRegenerateTripDialogOpen(false);
              handleRegenerateTripDraft();
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

export default TripDraftPage;
