import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../../api/authApi';
import { getFlaggedTrips } from '../../api/adminApi';
import type { FlaggedTripDay } from '../../types/admin';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface FlaggedDayEntry {
  day: number;
  reason: string | null;
  flagged_at: string;
}

interface FlaggedTripGroup {
  trip_id: string;
  destination: string;
  days: FlaggedDayEntry[];
  latestFlaggedAt: string;
}

/** GET /admin/flagged-trips는 (trip, day) 조합의 flat 리스트이므로 trip_id 기준으로 묶는다. */
function groupByTrip(rows: FlaggedTripDay[]): FlaggedTripGroup[] {
  const groups = new Map<string, FlaggedTripGroup>();

  for (const row of rows) {
    const entry: FlaggedDayEntry = { day: row.day, reason: row.reason, flagged_at: row.flagged_at };
    const existing = groups.get(row.trip_id);
    if (existing) {
      existing.days.push(entry);
      if (row.flagged_at > existing.latestFlaggedAt) {
        existing.latestFlaggedAt = row.flagged_at;
      }
    } else {
      groups.set(row.trip_id, {
        trip_id: row.trip_id,
        destination: row.destination,
        days: [entry],
        latestFlaggedAt: row.flagged_at,
      });
    }
  }

  const result = Array.from(groups.values());
  result.forEach((group) => group.days.sort((a, b) => a.day - b.day));
  // 최근에 플래그된 trip이 먼저 보이도록 정렬한다.
  result.sort((a, b) => (a.latestFlaggedAt < b.latestFlaggedAt ? 1 : -1));
  return result;
}

/**
 * 일정 품질 모니터링 (관리자)
 * PRD 6.5, 6.6, 11절 / docs/wireframe/관리자_품질모니터링_와이어프레임.html 참고
 *
 * GET /admin/flagged-trips 응답(day 단위 flat 리스트)을 trip_id로 그룹핑해 trip마다 카드 하나로
 * 표시하고, 그 안에 flagged day별 chip+reason을 나열한다. 통계 카드(전체 건수/최근 7일/최다
 * 목적지)는 새 API를 호출하지 않고 이미 받아온 리스트에서 클라이언트 사이드로 계산한다.
 */
function QualityMonitoringPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FlaggedTripDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchFlaggedTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFlaggedTrips();
      setRows(data);
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          '플래그된 일정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlaggedTrips();
  }, [fetchFlaggedTrips]);

  const groups = useMemo(() => (rows ? groupByTrip(rows) : []), [rows]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const totalFlagged = rows.length;
    const now = Date.now();
    const recentWeek = rows.filter(
      (row) => now - new Date(row.flagged_at).getTime() <= SEVEN_DAYS_MS,
    ).length;

    const destinationCounts = new Map<string, number>();
    rows.forEach((row) => {
      destinationCounts.set(row.destination, (destinationCounts.get(row.destination) ?? 0) + 1);
    });
    let topDestination: string | null = null;
    let topCount = 0;
    destinationCounts.forEach((count, destination) => {
      if (count > topCount) {
        topCount = count;
        topDestination = destination;
      }
    });

    return { totalFlagged, recentWeek, topDestination };
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const keyword = searchTerm.trim();
    if (!keyword) return groups;
    return groups.filter((group) => group.destination.includes(keyword));
  }, [groups, searchTerm]);

  const handleOpenTrip = (tripId: string) => {
    navigate(`/admin/flagged/${tripId}`);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          일정 품질 모니터링
        </Typography>
        <Typography variant="body2" color="text.secondary">
          동선 이상(route_warning.flagged=true)으로 판정된 trip/day 목록입니다.
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchFlaggedTrips}>
              다시 시도
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading && (
        <Grid container spacing={2}>
          {[0, 1, 2].map((index) => (
            <Grid key={index} size={{ xs: 12, sm: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Skeleton variant="text" width="50%" height={36} />
                  <Skeleton variant="text" width="70%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && !error && stats && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h4" sx={{ color: 'warning.main', fontWeight: 700 }}>
                  {stats.totalFlagged}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  전체 플래그 건수
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {stats.recentWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  최근 7일 플래그
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h4" sx={{ fontWeight: 700 }} noWrap>
                  {stats.topDestination ?? '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  플래그 최다 목적지
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {!loading && !error && rows !== null && rows.length > 0 && (
        <TextField
          size="small"
          placeholder="목적지로 검색"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ maxWidth: 320 }}
        />
      )}

      {!loading && !error && rows !== null && rows.length === 0 && (
        <Stack
          spacing={2}
          sx={{ alignItems: 'center', textAlign: 'center', py: 10, color: 'text.secondary' }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'success.light',
              color: 'success.contrastText',
            }}
          >
            <TaskAltIcon />
          </Box>
          <Typography variant="body2">
            현재 이상 동선으로 플래그된 일정이 없습니다.
          </Typography>
        </Stack>
      )}

      {!loading && !error && rows !== null && rows.length > 0 && (
        <>
          {filteredGroups.length === 0 ? (
            <Alert severity="info">'{searchTerm}'와 일치하는 플래그된 일정이 없어요.</Alert>
          ) : (
            <Stack spacing={2}>
              {filteredGroups.map((group) => (
                <Card key={group.trip_id} variant="outlined">
                  <CardActionArea onClick={() => handleOpenTrip(group.trip_id)}>
                    <CardContent>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
                      >
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {group.destination}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            trip_id: {group.trip_id}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          color="warning"
                          icon={<WarningAmberIcon fontSize="inherit" />}
                          label={`플래그 ${group.days.length}건`}
                        />
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack spacing={1}>
                        {group.days.map((entry) => (
                          <Stack
                            key={entry.day}
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'flex-start' }}
                          >
                            <Chip label={`Day ${entry.day}`} size="small" color="warning" variant="outlined" />
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {entry.reason ?? '사유 정보 없음'}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                        최근 판정: {new Date(group.latestFlaggedAt).toLocaleString()}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            플래그된 일정을 불러오는 중...
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

export default QualityMonitoringPage;
