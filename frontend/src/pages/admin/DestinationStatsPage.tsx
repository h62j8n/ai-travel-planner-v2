import { useCallback, useEffect, useMemo, useState } from 'react';
import PublicIcon from '@mui/icons-material/Public';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';

import { extractErrorMessage } from '../../api/authApi';
import { getDestinationStats } from '../../api/adminApi';
import type { DestinationStatItem, DestinationStatsPeriod } from '../../types/admin';

const PERIOD_OPTIONS: { value: DestinationStatsPeriod; label: string }[] = [
  { value: 'all', label: '전체 기간' },
  { value: 'month', label: '이번 달' },
  { value: 'week', label: '최근 7일' },
];

type SortKey = 'rank' | 'destination' | 'count' | 'lastCreatedAt';
type SortOrder = 'asc' | 'desc';

/** 순위 순으로 안정 정렬한 배열을 반환한다(바 차트는 항상 순위 순으로 표시한다). */
function sortByRank(items: DestinationStatItem[]): DestinationStatItem[] {
  return [...items].sort((a, b) => a.rank - b.rank);
}

function sortItems(items: DestinationStatItem[], key: SortKey, order: SortOrder): DestinationStatItem[] {
  const sorted = [...items].sort((a, b) => {
    let compare: number;
    switch (key) {
      case 'destination':
        compare = a.destination.localeCompare(b.destination, 'ko');
        break;
      case 'lastCreatedAt':
        compare = new Date(a.lastCreatedAt).getTime() - new Date(b.lastCreatedAt).getTime();
        break;
      case 'count':
        compare = a.count - b.count;
        break;
      case 'rank':
      default:
        compare = a.rank - b.rank;
        break;
    }
    return order === 'asc' ? compare : -compare;
  });
  return sorted;
}

/**
 * 인기 목적지 통계 (관리자)
 * PRD 6.6, 11절 / docs/wireframe/관리자_인기목적지통계_와이어프레임.html 참고
 *
 * GET /admin/stats/destinations?period=all|month|week 로 목적지별 여행 생성(POST /trips) 건수를
 * count 내림차순 rank가 매겨진 리스트로 받아온다. period는 서버에 쿼리로 전달해 재계산하고,
 * 표 정렬(순위/목적지/건수/최근 생성일)은 이미 받아온 리스트에서 클라이언트 사이드로 처리한다.
 * 막대 차트 라이브러리는 새로 추가하지 않고, 항목별 count 비율을 폭(%)으로 환산한 MUI Box로
 * 가볍게 구현한다(1위는 secondary 코랄 강조, 나머지는 primary 틸 강조).
 */
function DestinationStatsPage() {
  const [period, setPeriod] = useState<DestinationStatsPeriod>('all');
  const [items, setItems] = useState<DestinationStatItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchStats = useCallback(async (targetPeriod: DestinationStatsPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDestinationStats(targetPeriod);
      setItems(data.items);
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          '인기 목적지 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(period);
  }, [fetchStats, period]);

  const handlePeriodChange = (event: SelectChangeEvent<DestinationStatsPeriod>) => {
    setPeriod(event.target.value as DestinationStatsPeriod);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'destination' ? 'asc' : 'desc');
    }
  };

  const chartItems = useMemo(() => (items ? sortByRank(items) : []), [items]);
  const tableItems = useMemo(
    () => (items ? sortItems(items, sortKey, sortOrder) : []),
    [items, sortKey, sortOrder],
  );
  const maxCount = useMemo(
    () => chartItems.reduce((max, item) => Math.max(max, item.count), 0),
    [chartItems],
  );

  const isEmpty = !loading && !error && items !== null && items.length === 0;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box>
          <Typography variant="h5" component="h1">
            인기 목적지 통계
          </Typography>
          <Typography variant="body2" color="text.secondary">
            목적지별 여행 생성 건수 (GET /admin/stats/destinations)
          </Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="destination-stats-period-label">기간</InputLabel>
          <Select
            labelId="destination-stats-period-label"
            label="기간"
            value={period}
            onChange={handlePeriodChange}
            disabled={loading}
          >
            {PERIOD_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => fetchStats(period)}>
              다시 시도
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading && (
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent>
              <Skeleton variant="text" width="30%" height={28} sx={{ mb: 2 }} />
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} variant="rounded" width="100%" height={22} sx={{ mb: 1.5 }} />
              ))}
            </CardContent>
          </Card>
          <Skeleton variant="rounded" width="100%" height={220} />
        </Stack>
      )}

      {isEmpty && (
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
              bgcolor: 'action.hover',
              color: 'text.disabled',
            }}
          >
            <PublicIcon />
          </Box>
          <Typography variant="body2">해당 기간에 생성된 여행이 없습니다.</Typography>
        </Stack>
      )}

      {!loading && !error && items !== null && items.length > 0 && (
        <>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                목적지별 생성 건수
              </Typography>
              <Stack spacing={1.5}>
                {chartItems.map((item) => {
                  const widthPct = maxCount > 0 ? Math.max((item.count / maxCount) * 100, 4) : 0;
                  const isTop = item.rank === 1;
                  return (
                    <Stack
                      key={item.destination}
                      direction="row"
                      spacing={1.5}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ width: 88, flexShrink: 0, fontWeight: 600 }}
                        noWrap
                        title={item.destination}
                      >
                        {item.destination}
                      </Typography>
                      <Box
                        sx={{
                          flex: 1,
                          height: 22,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            width: `${widthPct}%`,
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            px: 1,
                            transition: 'width 0.3s ease',
                            background: (theme) =>
                              isTop
                                ? `linear-gradient(90deg, ${theme.palette.secondary.dark}, ${theme.palette.secondary.main})`
                                : `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: 'common.white', fontWeight: 700 }}
                          >
                            {item.count}
                          </Typography>
                        </Box>
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>

          <TableContainer component={Card} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={sortKey === 'rank' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortKey === 'rank'}
                      direction={sortKey === 'rank' ? sortOrder : 'asc'}
                      onClick={() => handleSort('rank')}
                    >
                      순위
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'destination' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortKey === 'destination'}
                      direction={sortKey === 'destination' ? sortOrder : 'asc'}
                      onClick={() => handleSort('destination')}
                    >
                      목적지
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'count' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortKey === 'count'}
                      direction={sortKey === 'count' ? sortOrder : 'desc'}
                      onClick={() => handleSort('count')}
                    >
                      생성 건수
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'lastCreatedAt' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortKey === 'lastCreatedAt'}
                      direction={sortKey === 'lastCreatedAt' ? sortOrder : 'desc'}
                      onClick={() => handleSort('lastCreatedAt')}
                    >
                      최근 생성일
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableItems.map((item) => (
                  <TableRow key={item.destination} hover>
                    <TableCell>
                      <Chip
                        label={`#${item.rank}`}
                        size="small"
                        color={item.rank === 1 ? 'secondary' : 'default'}
                        variant={item.rank === 1 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>{item.destination}</TableCell>
                    <TableCell>{item.count}건</TableCell>
                    <TableCell>{new Date(item.lastCreatedAt).toLocaleDateString('ko-KR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Typography variant="caption" color="text.secondary">
        * 기간 필터는 여행 생성(POST /trips) 시각 기준으로 집계됩니다.
      </Typography>
    </Stack>
  );
}

export default DestinationStatsPage;
