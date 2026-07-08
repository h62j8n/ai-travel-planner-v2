import { Typography } from '@mui/material';

/**
 * 인기 목적지 통계 (관리자)
 * PRD 6.6, 11절 / docs/wireframe/관리자_인기목적지통계_와이어프레임.html 참고
 * TODO: 목적지별 생성 건수 통계 조회(GET /api/admin/stats/destinations) 구현
 */
function DestinationStatsPage() {
  return <Typography variant="h5">인기 목적지 통계</Typography>;
}

export default DestinationStatsPage;
