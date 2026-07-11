import { GeneratedActivity } from '../interfaces/generated-itinerary.interface';
import { LatLon, haversineDistanceKm } from '../geocoding/haversine.util';

/**
 * 동선 판정 룰 (PRD §6.5, §12.5, WBS 3.6).
 *
 * flagged 여부는 Haversine 직선거리 + 시간 배분을 이용한 규칙 기반(rule-based) 판정으로만
 * 결정한다 — AI는 이 판정 자체(flagged 여부)에 관여하지 않는다. 이 파일은 그대로
 * "이동 거리/순서 기반 룰 체크"만 책임지고, 사용자에게 보여줄 자연어 사유(reason)는
 * itinerary-reorder.service.ts가 이 함수의 결과(RouteWarningIssueFact[])를 바탕으로
 * Gemini에게 별도로 생성을 요청한다(reorder-prompt.builder.ts 참고).
 *
 * templateReason은 AI 사유 생성이 (재시도까지) 실패했을 때 대체할 안전한 폴백 문장이다.
 * route_warning은 CLAUDE.md 핵심 규칙상 사용자 화면에 즉시 노출되어야 하므로, AI 호출
 * 실패를 이유로 flagged=true인데 reason만 비어 있는 상태를 만들지 않기 위한 안전망이다.
 */

/** 도보/근거리로 간주해 판정에서 무시하는 최소 거리(km). */
const MIN_FLAG_DISTANCE_KM = 0.3;
/** 이 속도(km/h)를 넘겨야 이동 가능한 경우 "촉박한 동선"으로 판단한다(시내 이동 상한 근사치). */
const MAX_REASONABLE_SPEED_KMH = 50;
/** "먼 이동"으로 볼 최소 편도 거리(km) — 왕복 동선 판정에 사용. */
const BACKTRACK_LEG_MIN_KM = 3;
/** 이 거리(km) 이내로 되돌아오면 "제자리로 복귀"로 간주 — 왕복 동선 판정에 사용. */
const BACKTRACK_RETURN_MAX_KM = 1;

const DEFAULT_DURATION_MINUTES = 60;

interface JudgeableActivity {
  activityKey: string;
  title: string;
  time: string;
  durationMinutes: number;
  coords: LatLon;
}

/**
 * flagged 판정의 근거가 되는 구조화된 사실 하나. AI 사유 생성 프롬프트에 그대로 실려
 * "AI가 사실을 지어내지 않고 이미 확정된 사실만 문장으로 옮기게" 강제하는 용도다.
 */
export interface RouteWarningIssueFact {
  kind: 'tight_schedule' | 'backtrack';
  fromTitle: string;
  toTitle: string;
  /** backtrack에서만 사용(중간 경유지 제목). */
  viaTitle?: string;
  distanceKm: number;
  /** tight_schedule에서만 사용(배정된 이동 가능 시간, 분). */
  gapMinutes?: number;
  /** AI 사유 생성이 실패했을 때 그대로 사용할 템플릿 문장(폴백 전용). */
  templateReason: string;
}

export interface RouteWarningJudgement {
  flagged: boolean;
  /** 최대 2개까지만 담는다(사용자 화면 과다 노출 방지, 기존 정책 유지). */
  issues: RouteWarningIssueFact[];
  /** flagged=false면 null. issues의 templateReason을 결합한 폴백 문장(AI 사유 생성 실패 시 사용). */
  fallbackReason: string | null;
}

function parseHHMMToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  return hour * 60 + minute;
}

/**
 * 새 순서(activities, 시간 재산정 결과)와 지오코딩 좌표 맵을 받아 동선을 판정한다.
 * 좌표가 없는(geocoding 실패) 활동은 이 함수 진입 전에 이미 제외되어 있어야 한다.
 */
export function judgeRouteWarning(
  activities: GeneratedActivity[],
  coordsByActivityKey: Map<string, LatLon | null>,
): RouteWarningJudgement {
  const judgeable: JudgeableActivity[] = activities
    .filter((activity) => activity.time !== null)
    .map((activity) => {
      const coords = coordsByActivityKey.get(activity.activityKey) ?? null;
      if (!coords) {
        return null;
      }
      return {
        activityKey: activity.activityKey,
        title: activity.title,
        time: activity.time as string,
        durationMinutes: activity.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        coords,
      };
    })
    .filter((value): value is JudgeableActivity => value !== null);

  if (judgeable.length < 2) {
    // 판정에 쓸 수 있는 좌표가 2개 미만이면(지오코딩 실패 다수 등) 판정하지 않는다
    // (안전한 폴백: flagged:false).
    return { flagged: false, issues: [], fallbackReason: null };
  }

  const issues: RouteWarningIssueFact[] = [];

  for (let i = 0; i < judgeable.length - 1; i += 1) {
    const issue = checkTightSchedule(judgeable[i], judgeable[i + 1]);
    if (issue) {
      issues.push(issue);
    }
  }

  for (let i = 0; i < judgeable.length - 2; i += 1) {
    const issue = checkBacktrack(
      judgeable[i],
      judgeable[i + 1],
      judgeable[i + 2],
    );
    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length === 0) {
    return { flagged: false, issues: [], fallbackReason: null };
  }

  // 사유가 여러 개여도 사용자 화면에 과도하게 길게 노출되지 않도록 최대 2개까지만 담는다.
  const limitedIssues = issues.slice(0, 2);
  const fallbackReason = limitedIssues
    .map((issue) => issue.templateReason)
    .join(' ');

  return { flagged: true, issues: limitedIssues, fallbackReason };
}

/** A→B 이동에 필요한 평균 속도가 비현실적으로 빠른 경우("촉박한 동선")를 감지한다. */
function checkTightSchedule(
  a: JudgeableActivity,
  b: JudgeableActivity,
): RouteWarningIssueFact | null {
  const distanceKm = haversineDistanceKm(a.coords, b.coords);
  if (distanceKm < MIN_FLAG_DISTANCE_KM) {
    return null;
  }

  const aStart = parseHHMMToMinutes(a.time);
  const bStart = parseHHMMToMinutes(b.time);
  const gapMinutes = bStart - (aStart + a.durationMinutes);

  if (gapMinutes <= 0) {
    return {
      kind: 'tight_schedule',
      fromTitle: a.title,
      toTitle: b.title,
      distanceKm,
      gapMinutes: 0,
      templateReason: `"${a.title}"에서 "${b.title}"까지 약 ${distanceKm.toFixed(1)}km 이동해야 하는데 배정된 이동 시간이 없습니다.`,
    };
  }

  const requiredSpeedKmh = distanceKm / (gapMinutes / 60);
  if (requiredSpeedKmh > MAX_REASONABLE_SPEED_KMH) {
    return {
      kind: 'tight_schedule',
      fromTitle: a.title,
      toTitle: b.title,
      distanceKm,
      gapMinutes,
      templateReason: `"${a.title}"에서 "${b.title}"까지 약 ${distanceKm.toFixed(1)}km를 ${gapMinutes}분 안에 이동해야 해 동선이 촉박합니다.`,
    };
  }

  return null;
}

/** A→B(먼 거리)→C(다시 A 근처)로 돌아오는 비효율적인 왕복 동선을 감지한다. */
function checkBacktrack(
  a: JudgeableActivity,
  b: JudgeableActivity,
  c: JudgeableActivity,
): RouteWarningIssueFact | null {
  const distAB = haversineDistanceKm(a.coords, b.coords);
  const distBC = haversineDistanceKm(b.coords, c.coords);
  const distAC = haversineDistanceKm(a.coords, c.coords);

  const hasFarLeg =
    distAB >= BACKTRACK_LEG_MIN_KM || distBC >= BACKTRACK_LEG_MIN_KM;
  const returnsNearStart = distAC <= BACKTRACK_RETURN_MAX_KM;

  if (hasFarLeg && returnsNearStart) {
    return {
      kind: 'backtrack',
      fromTitle: a.title,
      toTitle: c.title,
      viaTitle: b.title,
      distanceKm: Math.max(distAB, distBC),
      templateReason: `"${a.title}" → "${b.title}" → "${c.title}" 이동이 "${a.title}" 근처로 되돌아오는 왕복 동선이라 비효율적입니다.`,
    };
  }

  return null;
}
