import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LatLon } from './haversine.util';

const DEFAULT_NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Nominatim(OpenStreetMap) 사용 정책(https://operations.osmfoundation.org/policies/nominatim/)상
 * - 식별 가능한 User-Agent 헤더 필수
 * - 초당 1건을 넘지 않는 순차 호출 권장(동시 요청/짧은 간격 폭주 금지)
 * 를 지켜야 하므로, 이 값들은 상수로 고정하고 호출부(ItineraryReorderService)에서도
 * 활동 개수만큼 "순차적으로" 호출하도록 강제한다(Promise.all 등 동시 호출 금지).
 */
const NOMINATIM_USER_AGENT =
  'ai-travel-planner-v2/1.0 (portfolio project; non-commercial use)';
const MIN_REQUEST_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;

interface NominatimSearchResult {
  lat: string;
  lon: string;
}

/**
 * location 문자열 → 좌표 변환 (PRD §6.5, §12.5, WBS 3.5).
 * - 무료 서비스라는 점을 감안해 짧은 인메모리 캐시(같은 day 내 같은 location 문자열
 *   중복 요청 방지)와 호출 간 최소 간격(요청 폭주 방지)을 둔다.
 * - 실패(네트워크 오류/타임아웃/결과 없음)는 예외를 던지지 않고 null을 반환한다.
 *   호출부는 null을 "이 활동은 판정에서 제외"로 처리한다(전체 재조정을 실패시키지 않음).
 */
@Injectable()
export class NominatimClientService {
  private readonly logger = new Logger(NominatimClientService.name);
  private lastRequestAtMs = 0;

  constructor(private readonly configService: ConfigService) {}

  private get baseUrl(): string {
    return this.configService.get<string>(
      'NOMINATIM_BASE_URL',
      DEFAULT_NOMINATIM_BASE_URL,
    );
  }

  /**
   * location(장소명/주소)을 좌표로 변환한다. destination(여행지, 예: "부산")을 함께 넘기면
   * 검색 쿼리에 컨텍스트로 덧붙여 동명이인/동명 지역으로 인한 오탐을 줄인다.
   */
  async geocode(
    location: string,
    destination?: string | null,
  ): Promise<LatLon | null> {
    const trimmedLocation = location.trim();
    if (trimmedLocation === '') {
      return null;
    }

    const query = destination?.trim()
      ? `${trimmedLocation}, ${destination.trim()}`
      : trimmedLocation;

    await this.waitForRateLimit();

    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const url = new URL(`${this.baseUrl}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
          'Accept-Language': 'ko,en;q=0.8',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Nominatim 지오코딩 실패(status=${response.status}, query="${query}"), 이 활동은 판정에서 제외합니다.`,
        );
        return null;
      }

      const results = (await response.json()) as NominatimSearchResult[];
      const first = results[0];
      if (!first) {
        this.logger.warn(
          `Nominatim 지오코딩 결과 없음(query="${query}"), 이 활동은 판정에서 제외합니다.`,
        );
        return null;
      }

      const lat = Number.parseFloat(first.lat);
      const lon = Number.parseFloat(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        this.logger.warn(
          `Nominatim 응답 좌표 파싱 실패(query="${query}"), 이 활동은 판정에서 제외합니다.`,
        );
        return null;
      }

      return { lat, lon };
    } catch (error) {
      this.logger.warn(
        `Nominatim 지오코딩 중 오류(query="${query}"): ${String(error)}. 이 활동은 판정에서 제외합니다.`,
      );
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /** 직전 호출로부터 MIN_REQUEST_INTERVAL_MS가 지나지 않았으면 대기한다(요청 폭주 방지). */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAtMs;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
      );
    }
    this.lastRequestAtMs = Date.now();
  }
}
