import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
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
  Grid,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../../api/authApi';
import { getFlaggedTripDetail } from '../../api/adminApi';
import type { Activity, TripDay } from '../../types/trip';
import type { FlaggedTripDetail } from '../../types/admin';

/**
 * 활동 1건의 읽기 전용 표시 카드 (관리자 열람 전용, 드래그/편집 없음).
 * components/trip/SortableActivityItem.tsx의 ActivityCard와 시각적 언어는 맞추되,
 * 드래그 핸들 아이콘 등 "조작 가능"하다는 인상을 주는 요소는 의도적으로 제외한다.
 */
function ReadOnlyActivityRow({ activity }: { activity: Activity }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
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
          {activity.estimated_cost != null
            ? `${activity.estimated_cost.toLocaleString()}원`
            : '비용 정보 없음'}
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
    </Paper>
  );
}

/** day 1개의 읽기 전용 카드. route_warning은 사용자 화면(DayCard)과 동일한 시각 언어로 노출한다. */
function ReadOnlyDayCard({ day }: { day: TripDay }) {
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
          {day.last_modified && <Chip label="변경됨" color="secondary" size="small" />}
        </Stack>

        {day.route_warning.flagged && (
          <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit" />} sx={{ mt: 1.5 }}>
            <AlertTitle>동선 확인 필요</AlertTitle>
            {day.route_warning.reason ?? '이동 동선을 확인해 주세요.'}
          </Alert>
        )}

        <Stack spacing={1} sx={{ mt: 2 }}>
          {day.activities.map((activity) => (
            <ReadOnlyActivityRow key={activity.id} activity={activity} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * 플래그된 일정 상세 (관리자 열람 전용)
 * PRD 6.5, 6.6, 11절 참고. GET /admin/flagged/:tripId로 조회한 일정 전체(모든 day/activities)를
 * 표시한다. 편집/재조정/재생성 기능은 없으며 순수 열람용이다(CLAUDE.md: 플래그된 day라도 활동
 * 순서를 자동 재배열하지 않는다는 규칙과 별개로, 애초에 읽기 전용이라 해당 사항 없음).
 */
function FlaggedTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<FlaggedTripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getFlaggedTripDetail(tripId);
      setTrip(data);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(
          extractErrorMessage(err, '일정 상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const goToList = () => navigate('/admin/flagged-trips');

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={240} height={40} />
        <Skeleton variant="rounded" width="100%" height={100} />
        <Grid container spacing={2}>
          {[0, 1, 2].map((index) => (
            <Grid key={index} size={{ xs: 12, md: 6, lg: 4 }}>
              <Skeleton variant="rounded" width="100%" height={220} />
            </Grid>
          ))}
        </Grid>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            일정 상세를 불러오는 중...
          </Typography>
        </Stack>
      </Stack>
    );
  }

  if (notFound) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">해당 일정을 찾을 수 없습니다. 삭제되었거나 존재하지 않는 trip_id입니다.</Alert>
        <Box>
          <Button variant="outlined" onClick={goToList}>
            목록으로
          </Button>
        </Box>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack spacing={2}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchDetail}>
              다시 시도
            </Button>
          }
        >
          {error}
        </Alert>
        <Box>
          <Button variant="outlined" onClick={goToList}>
            목록으로
          </Button>
        </Box>
      </Stack>
    );
  }

  if (!trip) {
    return null;
  }

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
                {trip.destination}
              </Typography>
              <Chip label="관리자 열람 전용" size="small" color="secondary" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {trip.duration_days}일 일정 · trip_id: {trip.trip_id}
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
          <Button variant="outlined" onClick={goToList}>
            목록으로
          </Button>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {trip.days.map((day) => (
          <Grid key={day.day} size={{ xs: 12, md: 6, lg: 4 }}>
            <ReadOnlyDayCard day={day} />
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

export default FlaggedTripDetailPage;
