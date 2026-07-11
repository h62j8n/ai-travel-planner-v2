import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';

import type { Activity } from '../../types/trip';

interface SortableActivityItemProps {
  activity: Activity;
}

/**
 * Day 카드 내 활동 1건.
 * dnd-kit useSortable로 같은 day(SortableContext) 내에서만 드래그 순서 변경이 가능하다.
 */
function SortableActivityItem({ activity }: SortableActivityItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      variant="outlined"
      sx={{
        p: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        borderColor: isDragging ? 'primary.main' : 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          color: 'text.disabled',
          cursor: isDragging ? 'grabbing' : 'grab',
          pt: 0.5,
          touchAction: 'none',
        }}
        aria-label="드래그로 순서 변경"
      >
        <DragIndicatorIcon fontSize="small" />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="subtitle2"
            sx={{ color: activity.time ? 'primary.dark' : 'text.disabled', fontWeight: 700 }}
          >
            {activity.time ?? '시간 미정'}
          </Typography>
          <Chip label={activity.category} size="small" variant="outlined" />
        </Stack>

        <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 600 }}>
          {activity.title}
        </Typography>

        {activity.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {activity.description}
          </Typography>
        )}

        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 0.5, rowGap: 0.5, flexWrap: 'wrap' }}
          divider={
            <Typography variant="caption" color="text.secondary">
              ·
            </Typography>
          }
        >
          {activity.duration_minutes != null && (
            <Typography variant="caption" color="text.secondary">
              {activity.duration_minutes}분
            </Typography>
          )}
          {activity.location && (
            <Typography variant="caption" color="text.secondary">
              {activity.location}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {activity.estimated_cost != null ? `${activity.estimated_cost.toLocaleString()}원` : '비용 정보 없음'}
          </Typography>
        </Stack>

        {activity.tips && (
          <Typography
            variant="caption"
            sx={{ mt: 0.5, display: 'block', fontStyle: 'italic', color: 'secondary.dark' }}
          >
            팁: {activity.tips}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

export default SortableActivityItem;
