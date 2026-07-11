import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { extractErrorMessage } from '../api/authApi';
import { getTrips } from '../api/tripApi';
import type { TripListItem } from '../types/trip';

/**
 * 저장한 여행 목록 (사용자)
 * PRD 6.4, 11절 / docs/wireframe/저장한여행목록_와이어프레임.html 참고
 *
 * GET /trips 응답(최신순 정렬은 백엔드가 처리하므로 프론트에서 재정렬하지 않는다)을 카드 그리드로
 * 표시한다. 목록 응답은 days를 포함하지 않는 경량 스키마이므로, 카드 클릭 시에는 trip_id로만
 * 이동하고 상세 데이터는 TripItineraryPage가 GET /trips/{id}로 직접 조회한다.
 *
 * route_warning.flagged=true인 day는 관리자 전용 정보가 아니므로 "동선 주의 N일" 칩으로 즉시
 * 노출한다(CLAUDE.md 핵심 불변 규칙).
 */
function SavedTripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrips();
      setTrips(data);
    } catch (err) {
      setError(
        extractErrorMessage(err, '저장한 여행 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    const keyword = searchTerm.trim();
    if (!keyword) return trips;
    return trips.filter((trip) => trip.destination.includes(keyword));
  }, [trips, searchTerm]);

  const handleOpenTrip = (trip: TripListItem) => {
    navigate(`/trips/${trip.trip_id}`);
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="h5" component="h1">
          저장한 여행
        </Typography>
        <Stack direction="row" spacing={1.5}>
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
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="saved-trips-sort-label">정렬</InputLabel>
            <Select labelId="saved-trips-sort-label" label="정렬" value="latest" disabled>
              <MenuItem value="latest">최신순</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchTrips}>
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
            <Grid key={index} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Skeleton variant="text" width="60%" height={32} />
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rounded" width="100%" height={24} sx={{ mt: 1.5 }} />
                  <Skeleton variant="text" width="80%" sx={{ mt: 1.5 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && !error && trips !== null && trips.length === 0 && (
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
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
            }}
          >
            <FlightTakeoffIcon />
          </Box>
          <Typography variant="body2">
            아직 저장한 여행이 없어요. 새 일정을 만들어보세요.
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/trips/new')}>
            새 일정 만들기
          </Button>
        </Stack>
      )}

      {!loading && !error && trips !== null && trips.length > 0 && (
        <>
          {filteredTrips.length === 0 ? (
            <Alert severity="info">'{searchTerm}'와 일치하는 여행이 없어요.</Alert>
          ) : (
            <Grid container spacing={2}>
              {filteredTrips.map((trip) => (
                  <Grid key={trip.trip_id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardActionArea onClick={() => handleOpenTrip(trip)}>
                        <CardContent>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {trip.destination}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {trip.start_date} ~ {trip.end_date}
                          </Typography>

                          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                            <Chip
                              label={`revision ${trip.revision}`}
                              size="small"
                              color="primary"
                            />
                            {trip.flagged_days_count > 0 && (
                              <Chip
                                label={`동선 주의 ${trip.flagged_days_count}일`}
                                size="small"
                                color="warning"
                              />
                            )}
                          </Stack>

                          {trip.preferences && trip.preferences.length > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 1.5 }}
                            >
                              취향: {trip.preferences.join(', ')}
                            </Typography>
                          )}
                        </CardContent>
                      </CardActionArea>
                      <CardActions sx={{ justifyContent: 'flex-end' }}>
                        <Button size="small" variant="outlined" onClick={() => handleOpenTrip(trip)}>
                          상세보기
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            저장한 여행을 불러오는 중...
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

export default SavedTripsPage;
