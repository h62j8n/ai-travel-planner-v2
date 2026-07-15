import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';

import { generateTrip } from '../api/tripApi';
import { extractErrorMessage } from '../api/authApi';
import {
  COMPANION_OPTIONS,
  PREFERENCE_OPTIONS,
  tripCreateSchema,
  type TripCreateFormValues,
} from '../trips/tripSchemas';
import type { DraftTrip } from '../types/trip';

const DATE_FORMAT = 'YYYY-MM-DD';
const TIME_FORMAT = 'HH:mm';

/**
 * 일정 생성 폼 (사용자)
 * PRD 6.2, 8.1, 11절 / docs/wireframe/일정생성폼_와이어프레임.html 참고
 * 제출 시 POST /api/trips/generate 호출 -> 응답(TempTrip, trip_id 없음)은 아직 DB에 저장되지
 * 않은 임시 일정이다. 이후 조정/저장 과정에서 서버가 stateless라 입력값을 계속 기억할 수 없으므로,
 * 폼 입력값(values)과 AI 응답을 합친 DraftTrip을 만들어 /trips/draft로 함께 들고 이동한다(PRD 6.2.1).
 */
function TripCreatePage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripCreateFormValues>({
    resolver: zodResolver(tripCreateSchema),
    defaultValues: {
      destination: '',
      start_date: '',
      end_date: '',
      budget_level: '',
      activity_time_start: '09:00',
      activity_time_end: '20:00',
      companion: '',
      preferences: [],
    },
  });

  const watchedStartDate = useWatch({ control, name: 'start_date' });
  const watchedEndDate = useWatch({ control, name: 'end_date' });
  const watchedActivityTimeStart = useWatch({ control, name: 'activity_time_start' });
  const watchedActivityTimeEnd = useWatch({ control, name: 'activity_time_end' });

  const onSubmit = async (values: TripCreateFormValues) => {
    setSubmitError(null);
    try {
      const tempTrip = await generateTrip(values);
      const draft: DraftTrip = {
        ...values,
        summary: tempTrip.summary,
        duration_days: tempTrip.duration_days,
        days: tempTrip.days,
      };
      navigate('/trips/draft', { state: { draft } });
    } catch (error) {
      setSubmitError(
        extractErrorMessage(
          error,
          'AI 일정 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        ),
      );
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto' }}>
      <Box>
        <Typography variant="h5" component="h1">
          새 일정 만들기
        </Typography>
        <Typography variant="body2" color="text.secondary">
          목적지와 취향을 입력하면 AI가 일자별 여행 동선을 만들어드려요.
        </Typography>
      </Box>

      {submitError && <Alert severity="error">{submitError}</Alert>}

      <Paper elevation={1} sx={{ p: 4 }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={3}>
            <TextField
              label="목적지"
              placeholder="예: 부산, 오사카, 파리"
              required
              fullWidth
              error={!!errors.destination}
              helperText={errors.destination?.message}
              {...register('destination')}
            />

            <FormControl
              component="fieldset"
              fullWidth
              required
              error={!!errors.start_date || !!errors.end_date}
            >
              <FormLabel component="legend">여행 기간</FormLabel>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: errors.start_date || errors.end_date ? 'error.main' : 'divider',
                  borderRadius: 1,
                  p: 2,
                  mt: 1,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ alignItems: { sm: 'center' } }}
                >
                  <Controller
                    name="start_date"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="시작일"
                        format={DATE_FORMAT}
                        value={field.value ? dayjs(field.value) : null}
                        maxDate={watchedEndDate ? dayjs(watchedEndDate) : undefined}
                        onChange={(date: Dayjs | null) =>
                          field.onChange(date && date.isValid() ? date.format(DATE_FORMAT) : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            error: !!errors.start_date,
                            helperText: errors.start_date?.message,
                          },
                        }}
                      />
                    )}
                  />
                  <ArrowRightAltIcon
                    sx={{
                      display: { xs: 'none', sm: 'block' },
                      color: 'text.secondary',
                    }}
                  />
                  <Controller
                    name="end_date"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="종료일"
                        format={DATE_FORMAT}
                        value={field.value ? dayjs(field.value) : null}
                        minDate={watchedStartDate ? dayjs(watchedStartDate) : undefined}
                        onChange={(date: Dayjs | null) =>
                          field.onChange(date && date.isValid() ? date.format(DATE_FORMAT) : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            error: !!errors.end_date,
                            helperText: errors.end_date?.message,
                          },
                        }}
                      />
                    )}
                  />
                </Stack>
              </Box>
              {!errors.start_date && !errors.end_date && (
                <FormHelperText>여행 시작일과 종료일을 함께 선택해 주세요.</FormHelperText>
              )}
            </FormControl>

            <TextField
              label="예산 수준"
              placeholder="예: 알뜰하게, 100만원대, 럭셔리하게"
              required
              fullWidth
              slotProps={{ htmlInput: { maxLength: 30 } }}
              error={!!errors.budget_level}
              helperText={errors.budget_level?.message ?? '자유롭게 입력해 주세요 (최대 30자).'}
              {...register('budget_level')}
            />

            <FormControl
              component="fieldset"
              fullWidth
              required
              error={!!errors.activity_time_start || !!errors.activity_time_end}
            >
              <FormLabel component="legend">활동 시간대</FormLabel>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor:
                    errors.activity_time_start || errors.activity_time_end
                      ? 'error.main'
                      : 'divider',
                  borderRadius: 1,
                  p: 2,
                  mt: 1,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ alignItems: { sm: 'center' } }}
                >
                  <Controller
                    name="activity_time_start"
                    control={control}
                    render={({ field }) => (
                      <TimePicker
                        label="시작 시간"
                        format={TIME_FORMAT}
                        ampm={false}
                        value={field.value ? dayjs(field.value, TIME_FORMAT) : null}
                        maxTime={
                          watchedActivityTimeEnd
                            ? dayjs(watchedActivityTimeEnd, TIME_FORMAT)
                            : undefined
                        }
                        onChange={(time: Dayjs | null) =>
                          field.onChange(time && time.isValid() ? time.format(TIME_FORMAT) : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            error: !!errors.activity_time_start,
                            helperText: errors.activity_time_start?.message,
                          },
                        }}
                      />
                    )}
                  />
                  <ArrowRightAltIcon
                    sx={{
                      display: { xs: 'none', sm: 'block' },
                      color: 'text.secondary',
                    }}
                  />
                  <Controller
                    name="activity_time_end"
                    control={control}
                    render={({ field }) => (
                      <TimePicker
                        label="종료 시간"
                        format={TIME_FORMAT}
                        ampm={false}
                        value={field.value ? dayjs(field.value, TIME_FORMAT) : null}
                        minTime={
                          watchedActivityTimeStart
                            ? dayjs(watchedActivityTimeStart, TIME_FORMAT)
                            : undefined
                        }
                        onChange={(time: Dayjs | null) =>
                          field.onChange(time && time.isValid() ? time.format(TIME_FORMAT) : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            error: !!errors.activity_time_end,
                            helperText: errors.activity_time_end?.message,
                          },
                        }}
                      />
                    )}
                  />
                </Stack>
              </Box>
              {!errors.activity_time_start && !errors.activity_time_end && (
                <FormHelperText>
                  하루 중 활동을 원하는 시작/종료 시각을 선택해 주세요.
                </FormHelperText>
              )}
            </FormControl>

            <Controller
              name="companion"
              control={control}
              render={({ field }) => (
                <FormControl component="fieldset" required error={!!errors.companion}>
                  <FormLabel component="legend">동반인</FormLabel>
                  <RadioGroup row {...field}>
                    {COMPANION_OPTIONS.map((option) => (
                      <FormControlLabel
                        key={option}
                        value={option}
                        label={option}
                        control={<Radio />}
                      />
                    ))}
                  </RadioGroup>
                  <FormHelperText>{errors.companion?.message}</FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="preferences"
              control={control}
              render={({ field }) => (
                <FormControl component="fieldset" required error={!!errors.preferences}>
                  <FormLabel component="legend">취향 (다중 선택)</FormLabel>
                  <FormGroup row>
                    {PREFERENCE_OPTIONS.map((option) => (
                      <FormControlLabel
                        key={option}
                        label={option}
                        control={
                          <Checkbox
                            checked={field.value.includes(option)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                field.onChange([...field.value, option]);
                              } else {
                                field.onChange(
                                  field.value.filter((value) => value !== option),
                                );
                              }
                            }}
                          />
                        }
                      />
                    ))}
                  </FormGroup>
                  <FormHelperText>
                    {errors.preferences?.message ?? '하나 이상 선택해 주세요.'}
                  </FormHelperText>
                </FormControl>
              )}
            />

            <Button
              type="submit"
              variant="contained"
              color="secondary"
              size="large"
              fullWidth
              disabled={isSubmitting}
              startIcon={
                isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined
              }
            >
              {isSubmitting ? 'AI 일정 생성 중...' : 'AI 일정 생성'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              생성에는 약 10~20초가 소요될 수 있어요.
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}

export default TripCreatePage;
