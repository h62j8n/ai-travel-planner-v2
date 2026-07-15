import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItineraryDay } from '../trips/entities/itinerary-day.entity';
import { FlaggedTripDto } from './dto/flagged-trip.dto';
import { TripsService } from '../trips/trips.service';
import { TripResponseDto } from '../trips/dto/trip-response.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ItineraryDay)
    private readonly itineraryDaysRepository: Repository<ItineraryDay>,
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
}
