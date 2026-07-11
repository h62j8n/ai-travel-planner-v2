import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip } from './entities/trip.entity';
import { ItineraryDay } from './entities/itinerary-day.entity';
import { ItineraryActivity } from './entities/itinerary-activity.entity';
import { TripRevision } from './entities/trip-revision.entity';
import { AiResponseCache } from './entities/ai-response-cache.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripDayDto, TripResponseDto } from './dto/trip-response.dto';
import { ItineraryGeneratorService } from './itinerary-generator.service';
import { AppException } from '../common/exceptions/app.exception';
import { buildTripCacheKey } from './utils/cache-key.util';
import { GeneratedItinerary } from './interfaces/generated-itinerary.interface';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    @InjectRepository(AiResponseCache)
    private readonly aiResponseCacheRepository: Repository<AiResponseCache>,
    private readonly itineraryGeneratorService: ItineraryGeneratorService,
  ) {}

  /**
   * POST /api/trips (PRD §9, §8.1~§8.3 / WBS 2.5)
   * 1) duration_days 계산 및 날짜 검증
   * 2) ai_response_cache 조회 → 히트 시 재사용, 미스 시 생성 후 캐시 저장(PRD §6.8, 최초 생성에만 적용)
   * 3) trips/itinerary_days/itinerary_activities/trip_revisions 트랜잭션 저장, revision=1
   * 4) 응답은 §8.3 스키마로 매핑(trip_id, activities[].id 등 엔티티 PK와 다른 필드명 명시적 변환)
   */
  async create(dto: CreateTripDto, userId: string): Promise<TripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );
    const cacheKey = buildTripCacheKey(dto);
    const itinerary = await this.resolveItinerary(dto, durationDays, cacheKey);
    const { trip, days } = await this.persistTrip(
      dto,
      userId,
      durationDays,
      itinerary,
    );

    return this.toResponseDto(trip, days);
  }

  private calculateDurationDays(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppException(
        'VALIDATION_ERROR',
        '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).',
        HttpStatus.BAD_REQUEST,
      );
    }

    const diffDays =
      Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

    if (diffDays < 1) {
      throw new AppException(
        'VALIDATION_ERROR',
        '종료일은 시작일 이후여야 합니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return diffDays;
  }

  /**
   * ai_response_cache 조회 실패 시 캐시를 건너뛰고 생성으로 폴백한다(PRD §10).
   * 캐시 저장 실패도 요청을 실패시키지 않고 로깅만 한다(비용 절감 효과만 저하).
   */
  private async resolveItinerary(
    dto: CreateTripDto,
    durationDays: number,
    cacheKey: string,
  ): Promise<GeneratedItinerary> {
    let cached: AiResponseCache | null = null;
    try {
      cached = await this.aiResponseCacheRepository.findOne({
        where: { cacheKey },
      });
    } catch (error) {
      this.logger.warn(
        `ai_response_cache 조회 실패, AI 생성으로 폴백합니다: ${String(error)}`,
      );
    }

    if (cached) {
      return cached.responseJson as GeneratedItinerary;
    }

    const generated = await this.itineraryGeneratorService.generate(
      dto,
      durationDays,
    );

    try {
      await this.aiResponseCacheRepository.upsert(
        {
          cacheKey,
          requestParams: dto,
          responseJson: generated,
        },
        ['cacheKey'],
      );
    } catch (error) {
      this.logger.warn(
        `ai_response_cache 저장 실패(무시하고 계속 진행): ${String(error)}`,
      );
    }

    return generated;
  }

  /**
   * DB 오류는 PRD §10에 따라 503 STORAGE_ERROR로 변환한다.
   * (AppException으로 이미 분류된 에러는 그대로 재던짐)
   */
  private async persistTrip(
    dto: CreateTripDto,
    userId: string,
    durationDays: number,
    itinerary: GeneratedItinerary,
  ): Promise<{ trip: Trip; days: ItineraryDay[] }> {
    try {
      return await this.tripsRepository.manager.transaction(async (manager) => {
        const trip = await manager.save(
          Trip,
          manager.create(Trip, {
            userId,
            destination: dto.destination,
            startDate: dto.start_date,
            endDate: dto.end_date,
            durationDays,
            budgetLevel: dto.budget_level,
            activityTimeStart: dto.activity_time_start,
            activityTimeEnd: dto.activity_time_end,
            companion: dto.companion,
            preferences: dto.preferences,
            summary: itinerary.summary,
            revision: 1,
          }),
        );

        const savedDays: ItineraryDay[] = [];
        for (const day of itinerary.days) {
          const savedDay = await manager.save(
            ItineraryDay,
            manager.create(ItineraryDay, {
              tripId: trip.id,
              dayNumber: day.dayNumber,
              theme: day.theme,
              routeWarningFlagged: day.routeWarningFlagged,
              routeWarningReason: day.routeWarningReason,
              lastModifiedAt: null,
            }),
          );

          const activityEntities = day.activities.map((activity, index) =>
            manager.create(ItineraryActivity, {
              itineraryDayId: savedDay.id,
              activityKey: activity.activityKey,
              orderIndex: index,
              time: activity.time,
              title: activity.title,
              description: activity.description,
              category: activity.category,
              durationMinutes: activity.durationMinutes,
              location: activity.location,
              estimatedCost: activity.estimatedCost,
              tips: activity.tips,
            }),
          );

          savedDay.activities = await manager.save(
            ItineraryActivity,
            activityEntities,
          );
          savedDays.push(savedDay);
        }

        await manager.save(
          TripRevision,
          manager.create(TripRevision, {
            tripId: trip.id,
            revisionNumber: 1,
            changedDayNumber: null,
            daysSnapshot: this.toResponseDays(savedDays),
          }),
        );

        return { trip, days: savedDays };
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(
        `trips 저장 실패: ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new AppException(
        'STORAGE_ERROR',
        '일정을 저장하는 중 오류가 발생했습니다.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private toResponseDto(trip: Trip, days: ItineraryDay[]): TripResponseDto {
    return {
      trip_id: trip.id, // ERD §3.2: PK 컬럼명은 id → 응답 스펙 trip_id로 명시적 매핑
      destination: trip.destination,
      duration_days: trip.durationDays,
      summary: trip.summary,
      days: this.toResponseDays(days),
      meta: {
        generated_at: new Date().toISOString(),
        revision: trip.revision,
      },
    };
  }

  private toResponseDays(days: ItineraryDay[]): TripDayDto[] {
    return days
      .slice()
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => ({
        day: day.dayNumber,
        theme: day.theme,
        activities: (day.activities ?? [])
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((activity) => ({
            id: activity.activityKey, // ERD §3.4: activity_key가 응답의 id 필드(엔티티 PK가 아님)
            time: activity.time,
            title: activity.title,
            description: activity.description,
            category: activity.category,
            duration_minutes: activity.durationMinutes,
            location: activity.location,
            estimated_cost: activity.estimatedCost,
            tips: activity.tips,
          })),
        last_modified: false, // 최초 생성 시 전부 false(재조정 API에서만 true로 갱신)
        route_warning: {
          flagged: day.routeWarningFlagged,
          reason: day.routeWarningReason,
        },
      }));
  }
}
