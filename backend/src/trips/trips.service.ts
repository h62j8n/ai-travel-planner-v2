import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip } from './entities/trip.entity';
import { ItineraryDay } from './entities/itinerary-day.entity';
import { ItineraryActivity } from './entities/itinerary-activity.entity';
import { TripRevision } from './entities/trip-revision.entity';
import { AiResponseCache } from './entities/ai-response-cache.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { ReorderTripDto } from './dto/reorder-trip.dto';
import { TripDayDto, TripResponseDto } from './dto/trip-response.dto';
import { ItineraryGeneratorService } from './itinerary-generator.service';
import {
  ItineraryReorderService,
  ReorderDayInput,
  ReorderedDayResult,
} from './itinerary-reorder.service';
import { AppException } from '../common/exceptions/app.exception';
import { buildTripCacheKey } from './utils/cache-key.util';
import {
  GeneratedActivity,
  GeneratedItinerary,
} from './interfaces/generated-itinerary.interface';

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
    private readonly itineraryReorderService: ItineraryReorderService,
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

  /**
   * PATCH /api/trips/{trip_id}/reorder (PRD §8.2, §9 / WBS Phase 3)
   * 1) 소유권/day 범위/요청된 activity 집합 검증(핵심 불변 규칙: 요청한 day 외에는 절대 손대지 않음)
   * 2) ItineraryReorderService(ai-specialist 담당)가 해당 day만 재계산
   * 3) 응답 activity 집합을 원본과 다시 대조(2차 방어선) → 불일치 시 GENERATION_FAILED
   * 4) 트랜잭션 내에서 대상 ItineraryDay/ItineraryActivity 행만 갱신, revision 증가, 스냅샷 저장
   * 5) ai_response_cache는 조회/저장하지 않는다(PRD §6.8, 최초 생성 전용)
   */
  async reorder(
    tripId: string,
    dto: ReorderTripDto,
    userId: string,
  ): Promise<TripResponseDto> {
    const trip = await this.tripsRepository.findOne({
      where: { id: tripId },
      relations: { itineraryDays: { activities: true } },
    });

    if (!trip) {
      throw new AppException(
        'NOT_FOUND',
        '여행 일정을 찾을 수 없습니다.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (trip.userId !== userId) {
      throw new AppException(
        'FORBIDDEN',
        '본인 소유의 일정만 재조정할 수 있습니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (dto.day < 1 || dto.day > trip.durationDays) {
      throw new AppException(
        'VALIDATION_ERROR',
        `day는 1~${trip.durationDays} 범위여야 합니다.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const targetDay = (trip.itineraryDays ?? []).find(
      (day) => day.dayNumber === dto.day,
    );

    if (!targetDay) {
      throw new AppException(
        'VALIDATION_ERROR',
        '해당 일차의 일정 데이터를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentActivities = (targetDay.activities ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const currentKeys = currentActivities.map(
      (activity) => activity.activityKey,
    );

    if (
      !TripsService.arraysHaveSameElements(currentKeys, dto.new_activity_order)
    ) {
      throw new AppException(
        'VALIDATION_ERROR',
        'new_activity_order가 해당 day의 기존 활동 목록과 일치하지 않습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const activityByKey = new Map(
      currentActivities.map((activity) => [activity.activityKey, activity]),
    );
    const reorderedActivities: GeneratedActivity[] = dto.new_activity_order.map(
      (key) => this.toGeneratedActivity(activityByKey.get(key)!),
    );

    const reorderInput: ReorderDayInput = {
      destination: trip.destination,
      activityTimeStart: trip.activityTimeStart,
      activityTimeEnd: trip.activityTimeEnd,
      dayNumber: targetDay.dayNumber,
      theme: targetDay.theme,
      activities: reorderedActivities,
    };

    const result = await this.itineraryReorderService.reorderDay(reorderInput);

    const resultKeys = result.activities.map(
      (activity) => activity.activityKey,
    );
    if (!TripsService.arraysHaveSameElements(currentKeys, resultKeys)) {
      this.logger.error(
        `재조정 응답 activity 집합이 원본과 다릅니다(day=${dto.day}, tripId=${tripId}). 요청하지 않은 변경을 방지하기 위해 실패로 처리합니다.`,
      );
      throw new AppException(
        'GENERATION_FAILED',
        '재조정 결과 검증에 실패했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const { trip: updatedTrip, days } = await this.persistReorder(
      trip,
      targetDay,
      dto.day,
      result,
    );

    return this.toResponseDto(updatedTrip, days, dto.day);
  }

  /**
   * 대상 ItineraryDay와 그 소속 ItineraryActivity 행만 갱신한다.
   * 다른 day는 절대 조회/수정하지 않는다(핵심 불변 규칙).
   */
  private async persistReorder(
    trip: Trip,
    targetDay: ItineraryDay,
    changedDayNumber: number,
    result: ReorderedDayResult,
  ): Promise<{ trip: Trip; days: ItineraryDay[] }> {
    try {
      return await this.tripsRepository.manager.transaction(async (manager) => {
        const activityByKey = new Map(
          (targetDay.activities ?? []).map((activity) => [
            activity.activityKey,
            activity,
          ]),
        );

        const targetActivities: ItineraryActivity[] = [];
        for (const activity of result.activities) {
          const existing = activityByKey.get(activity.activityKey);
          if (!existing) {
            // arraysHaveSameElements 검증을 이미 통과했으므로 도달하지 않아야 하지만
            // 방어적으로 처리한다.
            continue;
          }
          existing.time = activity.time;
          targetActivities.push(existing);
        }

        // UNIQUE(itinerary_day_id, order_index) 제약은 즉시(IMMEDIATE) 검사되므로,
        // 최종 orderIndex를 바로 저장하면 다른 행이 아직 점유 중인 값과 충돌할 수 있다.
        // 1단계: 기존 범위(0 이상)와 절대 겹치지 않는 임시 음수 orderIndex로 먼저 저장해
        // 충돌을 회피한 뒤, 2단계에서 최종 orderIndex(0, 1, 2, ...)로 다시 저장한다.
        const tempOffsetActivities = targetActivities.map((activity, index) => {
          activity.orderIndex = -1000 - index;
          return activity;
        });
        await manager.save(ItineraryActivity, tempOffsetActivities);

        const finalActivities = targetActivities.map((activity, index) => {
          activity.orderIndex = index;
          return activity;
        });
        const updatedActivities = await manager.save(
          ItineraryActivity,
          finalActivities,
        );

        targetDay.theme = result.theme;
        targetDay.routeWarningFlagged = result.routeWarning.flagged;
        targetDay.routeWarningReason = result.routeWarning.reason;
        targetDay.lastModifiedAt = new Date();
        targetDay.activities = updatedActivities;

        const savedDay = await manager.save(ItineraryDay, targetDay);

        trip.revision += 1;
        const savedTrip = await manager.save(Trip, trip);

        const otherDays = (trip.itineraryDays ?? []).filter(
          (day) => day.dayNumber !== changedDayNumber,
        );
        const allDays = [...otherDays, savedDay];

        await manager.save(
          TripRevision,
          manager.create(TripRevision, {
            tripId: savedTrip.id,
            revisionNumber: savedTrip.revision,
            changedDayNumber,
            daysSnapshot: this.toResponseDays(allDays, changedDayNumber),
          }),
        );

        return { trip: savedTrip, days: allDays };
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(
        `trips 재조정 저장 실패: ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new AppException(
        'STORAGE_ERROR',
        '일정을 저장하는 중 오류가 발생했습니다.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private toGeneratedActivity(activity: ItineraryActivity): GeneratedActivity {
    return {
      activityKey: activity.activityKey,
      time: activity.time,
      title: activity.title,
      description: activity.description,
      category: activity.category,
      durationMinutes: activity.durationMinutes,
      location: activity.location,
      estimatedCost: activity.estimatedCost,
      tips: activity.tips,
    };
  }

  /**
   * PRD §8.3 응답 스키마는 time을 "HH:mm"(초 없음)으로만 명시한다.
   * Postgres time 컬럼에서 로드된 값은 "HH:mm:ss"로 직렬화되고,
   * 방금 생성/재조정된 값은 이미 "HH:mm"일 수 있으므로 양쪽 포맷 모두에 안전하게
   * 앞 5글자만 잘라 응답 직전에 통일한다(최초 생성/재조정 응답 공용).
   */
  private static normalizeTime(time: string | null): string | null {
    return time ? time.slice(0, 5) : null;
  }

  /** 두 배열이 순서 무관하게 정확히 같은 원소 집합(중복/누락 없이)을 갖는지 검증한다. */
  private static arraysHaveSameElements(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
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

  private toResponseDto(
    trip: Trip,
    days: ItineraryDay[],
    changedDayNumber?: number,
  ): TripResponseDto {
    return {
      trip_id: trip.id, // ERD §3.2: PK 컬럼명은 id → 응답 스펙 trip_id로 명시적 매핑
      destination: trip.destination,
      duration_days: trip.durationDays,
      summary: trip.summary,
      days: this.toResponseDays(days, changedDayNumber),
      meta: {
        generated_at: new Date().toISOString(),
        revision: trip.revision,
      },
    };
  }

  /**
   * changedDayNumber를 지정하면 해당 day만 last_modified:true로 표시한다.
   * 최초 생성(create())에서는 인자를 생략해 하위호환(항상 false)을 유지한다.
   */
  private toResponseDays(
    days: ItineraryDay[],
    changedDayNumber?: number,
  ): TripDayDto[] {
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
            time: TripsService.normalizeTime(activity.time),
            title: activity.title,
            description: activity.description,
            category: activity.category,
            duration_minutes: activity.durationMinutes,
            location: activity.location,
            estimated_cost: activity.estimatedCost,
            tips: activity.tips,
          })),
        last_modified: day.dayNumber === changedDayNumber,
        route_warning: {
          flagged: day.routeWarningFlagged,
          reason: day.routeWarningReason,
        },
      }));
  }
}
