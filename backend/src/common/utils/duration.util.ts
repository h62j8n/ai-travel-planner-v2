/**
 * "30m", "1h", "3600", "3600s" 같은 jwt.sign 스타일 만료 표현을 초 단위 숫자로 변환한다.
 * JWT_EXPIRES_IN 환경변수를 JwtModule 서명 옵션과 로그인/회원가입 응답의
 * expires_in 필드에 동시에 재사용하기 위한 유틸리티.
 */
export function parseDurationToSeconds(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(s|m|h|d)?$/.exec(trimmed);

  if (!match) {
    return 3600; // 파싱 실패 시 안전한 기본값(1시간)
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * multipliers[unit];
}
