import type { ReactNode } from 'react';
import { Backdrop, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';

import DayCard from './DayCard';
import type { Activity, TripDay } from '../../types/trip';

interface ItineraryBoardProps {
  destination: string;
  durationDays: number;
  summary: string | null;
  preferences: string[];
  days: TripDay[];
  /** revision 칩 라벨. 임시(draft) 상태에는 revision이 없으므로 생략하면 칩을 표시하지 않는다. */
  revisionLabel?: string;
  /** 임시 상태 안내 칩 등 제목 옆에 추가로 노출할 배지. */
  extraTitleBadge?: ReactNode;
  /** 헤더 우측 액션 버튼 영역(전체 재생성/저장/목록으로 등) — 페이지별로 다르므로 그대로 주입받는다. */
  headerActions: ReactNode;
  /**
   * 미리보기 API(reorder/regenerate-day)가 성공해 로컬에 반영됐지만 아직 "저장" 버튼을
   * 누르지 않은 day 집합. last_modified(서버가 이번 응답에서 재계산한 day)와는 다른 개념이므로
   * 별도 배지로 구분한다. 저장된 trip 모드(TripItineraryPage)에서만 의미가 있어 생략 가능.
   */
  unsavedDays?: ReadonlySet<number>;
  reorderingDay: number | null;
  /**
   * 같은 day 내 드래그로 순서를 바꾸는 즉시(드롭 시점) 또는 "동선 최적화 재요청" 버튼 클릭 시
   * 호출 — 실제 PATCH 재조정 요청을 트리거한다(별도 확인 버튼 없이 바로 서버에 반영 시도).
   */
  onRequestReorder: (dayNumber: number, activities: Activity[]) => void;
  regeneratingDay: number | null;
  onRequestRegenerateDay: (dayNumber: number) => void;
  /** 헤더 액션(전체 재생성/저장 등)이 진행 중이어서 day별 액션까지 함께 잠가야 하는지 여부. */
  otherActionInProgress: boolean;
  /** 전역 로딩 오버레이 표시 여부(재조정/day 재생성/전체 재생성/저장 등). */
  backdropOpen: boolean;
  backdropLabel: string;
}

/**
 * 일정표 화면(임시 draft 모드 / 저장된 trip 모드)이 공유하는 프레젠테이션 레이어.
 * - 헤더(목적지/기간/요약/취향/액션 버튼), day별 카드 그리드, 로딩 백드롭을 담당한다.
 * - API 호출/상태 관리/다이얼로그/토스트는 각 페이지(TripDraftPage, TripItineraryPage)가 소유하고
 *   이 컴포넌트에는 순수하게 데이터와 콜백만 내려준다(DayCard와 동일한 설계 원칙).
 */
function ItineraryBoard({
  destination,
  durationDays,
  summary,
  preferences,
  days,
  revisionLabel,
  extraTitleBadge,
  headerActions,
  unsavedDays,
  reorderingDay,
  onRequestReorder,
  regeneratingDay,
  onRequestRegenerateDay,
  otherActionInProgress,
  backdropOpen,
  backdropLabel,
}: ItineraryBoardProps) {
  const isAnyActionInProgress =
    reorderingDay !== null || regeneratingDay !== null || otherActionInProgress;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h5" component="h1">
                {destination}
              </Typography>
              {revisionLabel && <Chip label={revisionLabel} size="small" color="primary" />}
              {extraTitleBadge}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {durationDays}일 일정
            </Typography>
            {summary && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {summary}
              </Typography>
            )}
            {preferences.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 1, rowGap: 0.5, flexWrap: 'wrap' }}>
                {preferences.map((preference) => (
                  <Chip key={preference} label={preference} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            {headerActions}
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {days.map((day) => (
          <Grid key={day.day} size={{ xs: 12, md: 6, lg: 4 }}>
            <DayCard
              day={day}
              unsaved={unsavedDays?.has(day.day) ?? false}
              onRequestReorder={onRequestReorder}
              isReordering={reorderingDay === day.day}
              onRequestRegenerateDay={onRequestRegenerateDay}
              isRegeneratingDay={regeneratingDay === day.day}
              disableActions={
                isAnyActionInProgress && reorderingDay !== day.day && regeneratingDay !== day.day
              }
            />
          </Grid>
        ))}
      </Grid>

      <Backdrop
        open={backdropOpen}
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography variant="body2">{backdropLabel}</Typography>
        </Stack>
      </Backdrop>
    </Stack>
  );
}

export default ItineraryBoard;
