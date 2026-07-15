import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

import type { Activity, TripDay } from '../../types/trip';
import SortableActivityItem, { ActivityCard } from './SortableActivityItem';

interface DayCardProps {
  day: TripDay;
  /**
   * 미리보기 API(reorder/regenerate-day)가 성공해 로컬에는 반영됐지만 아직 "저장" 버튼을
   * 누르지 않은 상태인지 여부. last_modified(서버가 이번 응답에서 재계산했다는 뜻)와는 다른
   * 개념 — "커밋 대기 중"을 의미한다.
   */
  unsaved?: boolean;
  /**
   * 같은 day 내 드래그로 순서를 바꾸는 즉시(드롭 시점) 호출 — 별도 확인 버튼 없이 바로 실제
   * PATCH 재조정 요청을 트리거한다. "동선 최적화 재요청" 버튼 클릭 시에도 동일하게 호출된다.
   */
  onRequestReorder: (dayNumber: number, activities: Activity[]) => void;
  /** 이 day에 대한 재조정 요청이 진행 중인지 여부 (버튼 비활성화 + 로딩 표시용). */
  isReordering: boolean;
  /** "활동 재생성" 확인 다이얼로그에서 최종 확인 시 호출 — PATCH /trips/{id}/regenerate-day 트리거. */
  onRequestRegenerateDay: (dayNumber: number) => void;
  /** 이 day에 대한 활동 재생성 요청이 진행 중인지 여부 (버튼 비활성화 + 로딩 표시용). */
  isRegeneratingDay: boolean;
  /** 다른 day의 재조정/재생성이 진행 중일 때 이 카드의 액션 버튼을 모두 비활성화하기 위한 플래그. */
  disableActions: boolean;
}

/**
 * 일자별 카드.
 * - route_warning.flagged=true여도 활동 순서는 사용자가 정한 그대로 유지한다 (자동 재배열 금지).
 * - 드래그는 이 카드가 소유한 DndContext/SortableContext 안에서만 동작하므로 다른 day에는 영향이 없다.
 * - 드래그를 놓는 즉시 onRequestReorder를 호출해 실제 서버 재조정 요청을 보낸다(별도 확인 버튼 없음).
 */
function DayCard({
  day,
  unsaved = false,
  onRequestReorder,
  isReordering,
  onRequestRegenerateDay,
  isRegeneratingDay,
  disableActions,
}: DayCardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (isReordering || disableActions) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = day.activities.findIndex((activity) => activity.id === active.id);
    const newIndex = day.activities.findIndex((activity) => activity.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onRequestReorder(day.day, arrayMove(day.activities, oldIndex, newIndex));
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeActivity = activeId
    ? day.activities.find((activity) => activity.id === activeId)
    : undefined;

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ color: 'primary.dark', fontWeight: 700 }}>
              Day {day.day}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {day.theme ?? '테마 미정'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            {day.last_modified && (
              <Chip label="변경됨" color="secondary" size="small" />
            )}
            {unsaved && (
              <Chip label="저장 안 됨" color="warning" size="small" variant="outlined" />
            )}
          </Stack>
        </Stack>

        {day.route_warning.flagged && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit" />} sx={{ mt: 1.5 }}>
            <AlertTitle>동선 확인 필요</AlertTitle>
            {day.route_warning.reason ?? '이동 동선을 확인해 주세요.'}
          </Alert>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={day.activities.map((activity) => activity.id)}
            strategy={verticalListSortingStrategy}
          >
            <Stack spacing={1} sx={{ mt: 2 }}>
              {day.activities.map((activity) => (
                <SortableActivityItem key={activity.id} activity={activity} />
              ))}
            </Stack>
          </SortableContext>
          <DragOverlay>
            {activeActivity ? <ActivityCard activity={activeActivity} isDragging /> : null}
          </DragOverlay>
        </DndContext>

        <Stack spacing={1} sx={{ mt: 2 }}>
          {day.route_warning.flagged && (
            <Button
              variant="outlined"
              color="primary"
              size="small"
              fullWidth
              disabled={isReordering || disableActions}
              startIcon={isReordering ? <CircularProgress size={16} color="inherit" /> : undefined}
              onClick={() => onRequestReorder(day.day, day.activities)}
            >
              동선 최적화 재요청
            </Button>
          )}

          {/* PRD 6.3.2: day 전체 활동을 새로 교체하는, 순서 변경보다 파괴적인 액션이므로
              색상(error)으로 시각적으로 구분하고 확인 다이얼로그를 거친다. */}
          <Button
            variant="outlined"
            color="error"
            size="small"
            fullWidth
            disabled={isRegeneratingDay || disableActions}
            startIcon={
              isRegeneratingDay ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AutorenewIcon fontSize="small" />
              )
            }
            onClick={() => setRegenerateDialogOpen(true)}
          >
            활동 재생성
          </Button>
        </Stack>
      </CardContent>

      <Dialog
        open={regenerateDialogOpen}
        onClose={() => setRegenerateDialogOpen(false)}
        aria-labelledby={`regenerate-day-${day.day}-dialog-title`}
      >
        <DialogTitle id={`regenerate-day-${day.day}-dialog-title`}>
          Day {day.day} 활동을 재생성할까요?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Day {day.day}의 활동이 모두 새로 교체됩니다. 다른 day는 그대로 유지되며, 되돌릴 수
            없습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateDialogOpen(false)}>취소</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setRegenerateDialogOpen(false);
              onRequestRegenerateDay(day.day);
            }}
          >
            재생성
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export default DayCard;
