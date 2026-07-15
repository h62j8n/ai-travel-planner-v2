import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItineraryDay } from '../trips/entities/itinerary-day.entity';
import { Trip } from '../trips/entities/trip.entity';
import { FlaggedTripDto } from './dto/flagged-trip.dto';
import {
  DestinationStatItemDto,
  DestinationStatsPeriod,
  DestinationStatsResponseDto,
} from './dto/destination-stats.dto';
import { TripsService } from '../trips/trips.service';
import { TripResponseDto } from '../trips/dto/trip-response.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ItineraryDay)
    private readonly itineraryDaysRepository: Repository<ItineraryDay>,
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly tripsService: TripsService,
  ) {}

  /**
   * GET /api/admin/flagged-trips (PRD §6.5, §6.6 / §9)
   * route_warning_flagged=true인 일자를 trips와 조인해 관리자 모니터링 목록으로 반환한다.
   * flagged_at은 day.last_modified_at을 우선 사용하고, 없으면(재조정된 적 없는 최초 생성 건)
   * trip.updated_at으로 대체한다(ERD §3.3에 판정 전용 타임스탬프 컬럼이 없어 채택한 대안).
   */
  async getFlaggedTrips(): Promise<FlaggedTripDto[]> {
    const rows = await this.itineraryDaysRepository
      .createQueryBuilder('day')
      .innerJoin('day.trip', 'trip')
      .select('trip.id', 'tripId')
      .addSelect('trip.destination', 'destination')
      .addSelect('day.dayNumber', 'dayNumber')
      .addSelect('day.routeWarningReason', 'reason')
      .addSelect('COALESCE(day.lastModifiedAt, trip.updatedAt)', 'flaggedAt')
      .where('day.routeWarningFlagged = :flagged', { flagged: true })
      .orderBy('COALESCE(day.lastModifiedAt, trip.updatedAt)', 'DESC')
      .getRawMany<{
        tripId: string;
        destination: string;
        dayNumber: number;
        reason: string | null;
        flaggedAt: Date;
      }>();

    return rows.map((row) => ({
      trip_id: row.tripId,
      destination: row.destination,
      day: row.dayNumber,
      reason: row.reason,
      flagged_at: new Date(row.flaggedAt).toISOString(),
    }));
  }

  /**
   * GET /api/admin/flagged/{trip_id} (PRD §6.5, §6.6, §9 / 관리자 열람 모드)
   * flagged-trips 목록에서 "상세보기" 클릭 시 진입. 사용자용 GET /trips/{trip_id}와
   * 동일한 TripResponseDto 스키마를 그대로 반환한다(days[].route_warning 포함, 활동
   * 순서는 저장된 그대로 — 재배열하지 않음). 소유권 검사는 하지 않는다(관리자는 어떤
   * 사용자의 trip이든 조회 가능해야 하므로 TripsService.findOneForAdmin() 사용).
   */
  async getFlaggedTripDetail(tripId: string): Promise<TripResponseDto> {
    return this.tripsService.findOneForAdmin(tripId);
  }

  /**
   * GET /api/admin/stats/destinations (PRD §6.6, §9 / WBS Phase 4.4)
   * trips.destination 기준 GROUP BY 집계(ERD §5 "trips(destination) — 관리자 인기
   * 목적지 통계용 GROUP BY 성능" 인덱스 활용). ai_response_cache와 무관한 단순 통계
   * 조회이므로 캐싱을 적용하지 않는다. period 필터는 trips.created_at 기준.
   */
  async getDestinationStats(
    period: DestinationStatsPeriod = 'all',
  ): Promise<DestinationStatsResponseDto> {
    const from = this.resolvePeriodStart(period);

    const qb = this.tripsRepository
      .createQueryBuilder('trip')
      .select('trip.destination', 'destination')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(trip.createdAt)', 'lastCreatedAt')
      .groupBy('trip.destination')
      .orderBy('COUNT(*)', 'DESC')
      // tie-break: 동일 생성 건수인 경우 destination 오름차순으로 안정 정렬
      .addOrderBy('trip.destination', 'ASC');

    if (from) {
      qb.where('trip.createdAt >= :from', { from });
    }

    const rows = await qb.getRawMany<{
      destination: string;
      count: string;
      lastCreatedAt: Date;
    }>();

    const items: DestinationStatItemDto[] = rows.map((row, index) => ({
      rank: index + 1,
      destination: row.destination,
      count: Number(row.count),
      lastCreatedAt: new Date(row.lastCreatedAt).toISOString(),
    }));

    return { period, items };
  }

  /**
   * period 필터 시작 시각을 계산한다. 서버(UTC) 기준으로 결정한다.
   * - all: 필터 없음(null)
   * - week: 현재 시각으로부터 최근 7일(rolling 7 days)
   * - month: 이번 달 1일 00:00:00 UTC(캘린더 월 기준)
   */
  private resolvePeriodStart(period: DestinationStatsPeriod): Date | null {
    if (period === 'all') {
      return null;
    }

    const now = new Date();

    if (period === 'week') {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // month
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }
}
