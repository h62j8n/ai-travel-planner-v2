import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Alert, AlertTitle, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import type { Activity, TripDay } from '../../types/trip';
import SortableActivityItem from './SortableActivityItem';

interface DayCardProps {
  day: TripDay;
  /** 드래그로 순서를 바꿨지만 아직 재조정 요청을 보내지 않은 상태인지 여부 (다음 단계 작업을 위한 시각적 표시). */
  pending: boolean;
  onReorder: (dayNumber: number, activities: Activity[]) => void;
}

/**
 * 일자별 카드.
 * - route_warning.flagged=true여도 활동 순서는 사용자가 정한 그대로 유지한다 (자동 재배열 금지).
 * - 드래그는 이 카드가 소유한 DndContext/SortableContext 안에서만 동작하므로 다른 day에는 영향이 없다.
 */
function DayCard({ day, pending, onReorder }: DayCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = day.activities.findIndex((activity) => activity.id === active.id);
    const newIndex = day.activities.findIndex((activity) => activity.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(day.day, arrayMove(day.activities, oldIndex, newIndex));
  };

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderColor: pending ? 'secondary.main' : 'divider',
        borderWidth: pending ? 2 : 1,
      }}
    >
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
            {pending && (
              <Chip label="순서 변경 대기" color="secondary" size="small" variant="outlined" />
            )}
          </Stack>
        </Stack>

        {day.route_warning.flagged && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit" />} sx={{ mt: 1.5 }}>
            <AlertTitle>동선 확인 필요</AlertTitle>
            {day.route_warning.reason ?? '이동 동선을 확인해 주세요.'}
          </Alert>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        </DndContext>
      </CardContent>
    </Card>
  );
}

export default DayCard;
