import { Fragment, useCallback, useEffect, useState } from 'react';
import DescriptionIcon from '@mui/icons-material/Description';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
  Grid,
} from '@mui/material';

import { extractErrorMessage } from '../../api/authApi';
import { getPromptTemplateDetail, getPromptTemplates, updatePromptTemplate } from '../../api/adminApi';
import type { PromptTemplate } from '../../types/admin';

interface Toast {
  message: string;
  severity: 'success' | 'error';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR');
}

/**
 * 프롬프트 템플릿 관리 (관리자)
 * PRD 6.6, WBS 4.5 / docs/wireframe/관리자_프롬프트템플릿관리_와이어프레임.html 참고
 *
 * GET /admin/prompt-templates로 목록(이름/버전/최종 수정일 요약)을 좌측 카드 리스트에 표시하고,
 * 항목을 선택하면 GET /admin/prompt-templates/:id로 전체 content를 불러와 우측 편집 영역에
 * 표시한다. 마운트 시 첫 번째 템플릿을 자동 선택한다.
 *
 * 와이어프레임에는 버전별 히스토리를 선택해 미리보기하는 버전 칩(v1/v2/v3...) UI가 그려져
 * 있으나, 실제 ERD(3.6 prompt_templates)에는 버전 히스토리 테이블이 없고 템플릿 1건당 정수
 * version 컬럼 하나만 존재한다(저장 시 이전 내용 없이 그 자리에서 +1, 낙관적 락 없음). 따라서
 * 버전 선택/미리보기 UI는 만들지 않고, 현재 version 값을 읽기 전용 Chip 배지로만 노출한다.
 *
 * 저장(PUT /admin/prompt-templates/:id)은 content만 전송하며, 응답으로 받은 새 version/updated_at을
 * 그대로 신뢰해 편집 영역과 좌측 목록 항목에 반영한다.
 */
function PromptTemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplate[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptTemplate | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await getPromptTemplates();
      setTemplates(data);
      setSelectedId((prev) => prev ?? (data.length > 0 ? data[0].id : null));
    } catch (err) {
      setListError(
        extractErrorMessage(
          err,
          '프롬프트 템플릿 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        ),
      );
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await getPromptTemplateDetail(id);
      setDetail(data);
      setEditedContent(data.content);
    } catch (err) {
      setDetailError(
        extractErrorMessage(
          err,
          '템플릿 상세 내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }, [selectedId, fetchDetail]);

  const handleSelect = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await updatePromptTemplate(detail.id, { content: editedContent });
      setDetail(updated);
      setEditedContent(updated.content);
      setTemplates((prev) =>
        prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev,
      );
      setToast({ message: `${updated.name} → v${updated.version}로 저장되었습니다.`, severity: 'success' });
    } catch (err) {
      setToast({
        message: extractErrorMessage(err, '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const isEmpty = !listLoading && !listError && templates !== null && templates.length === 0;
  const isDirty = detail !== null && editedContent !== detail.content;
  const saveDisabled = !detail || !isDirty || saving || detailLoading;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          프롬프트 템플릿 관리
        </Typography>
        <Typography variant="body2" color="text.secondary">
          GET/PUT /admin/prompt-templates — 목록 조회 및 내용 수정
        </Typography>
      </Box>

      {listError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchList}>
              다시 시도
            </Button>
          }
        >
          {listError}
        </Alert>
      )}

      {isEmpty ? (
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
            <DescriptionIcon />
          </Box>
          <Typography variant="body2">등록된 프롬프트 템플릿이 없습니다.</Typography>
        </Stack>
      ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined">
              {listLoading ? (
                <CardContent>
                  <Stack spacing={1.5}>
                    {[0, 1, 2].map((index) => (
                      <Skeleton key={index} variant="rounded" width="100%" height={56} />
                    ))}
                  </Stack>
                </CardContent>
              ) : (
                <List disablePadding>
                  {(templates ?? []).map((item, index) => (
                    <Fragment key={item.id}>
                      <ListItemButton
                        selected={item.id === selectedId}
                        onClick={() => handleSelect(item.id)}
                      >
                        <ListItemText
                          primary={item.name}
                          secondary={
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                              <Chip label={`v${item.version}`} size="small" variant="outlined" />
                              <Typography variant="caption" color="text.secondary">
                                {formatDateTime(item.updated_at)}
                              </Typography>
                            </Stack>
                          }
                          slotProps={{
                            primary: { variant: 'body2', sx: { fontWeight: 700 } },
                            secondary: { component: 'div' },
                          }}
                        />
                      </ListItemButton>
                      {index < (templates?.length ?? 0) - 1 && <Divider component="li" />}
                    </Fragment>
                  ))}
                </List>
              )}
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Card variant="outlined">
              <CardContent>
                {detailLoading && (
                  <Stack spacing={2}>
                    <Skeleton variant="text" width="40%" height={32} />
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="rounded" width="100%" height={320} />
                  </Stack>
                )}

                {!detailLoading && detailError && (
                  <Alert
                    severity="error"
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => selectedId && fetchDetail(selectedId)}
                      >
                        다시 시도
                      </Button>
                    }
                  >
                    {detailError}
                  </Alert>
                )}

                {!detailLoading && !detailError && detail && (
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
                    >
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {detail.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          최종 수정일: {formatDateTime(detail.updated_at)}
                        </Typography>
                      </Box>
                      <Chip label={`v${detail.version}`} color="primary" variant="outlined" />
                    </Stack>

                    <TextField
                      multiline
                      fullWidth
                      minRows={16}
                      value={editedContent}
                      onChange={(event) => setEditedContent(event.target.value)}
                      slotProps={{
                        input: {
                          sx: { fontFamily: 'Roboto Mono, Consolas, monospace', fontSize: 13 },
                        },
                      }}
                    />

                    <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saveDisabled}
                      >
                        {saving ? '저장 중...' : '저장'}
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

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
    </Stack>
  );
}

export default PromptTemplatesPage;
