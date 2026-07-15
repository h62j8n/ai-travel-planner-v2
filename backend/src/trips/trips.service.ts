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
import { RegenerateDayDto } from './dto/regenerate-day.dto';
import {
  TempTripResponseDto,
  TripDayDto,
  TripResponseDto,
} from './dto/trip-response.dto';
import {
  RegenerateDayTempDto,
  RegenerateSaveDto,
  ReorderTempDto,
  SaveTripDaysDto,
  SaveTripDto,
  TripActivityInputDto,
  TripDayInputDto,
} from './dto/temp-trip.dto';
import { TripListItemDto } from './dto/trip-list-item.dto';
import { ItineraryGeneratorService } from './itinerary-generator.service';
import {
  ItineraryReorderService,
  ReorderDayInput,
} from './itinerary-reorder.service';
import {
  ItineraryRegenerateService,
  RegenerateDayInput,
} from './itinerary-regenerate.service';
import { AppException } from '../common/exceptions/app.exception';
import { buildTripCacheKey } from './utils/cache-key.util';
import {
  GeneratedActivity,
  GeneratedDay,
  GeneratedItinerary,
} from './interfaces/generated-itinerary.interface';
import type { Preference } from './constants/trip-options.constants';

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
    private readonly itineraryRegenerateService: ItineraryRegenerateService,
  ) {}

  /**
   * POST /api/trips/generate (PRD §6.2.1, §8.3, §9 / v2.5 "임시 조정 → 명시적 저장")
   * 임시(저장 전) 최초 생성. DB에는 전혀 접근하지 않는다(trips/itinerary_days/
   * itinerary_activities 어느 테이블에도 행이 생기지 않음) — sessionStorage 임시
   * 저장은 프론트 책임이다. ai_response_cache는 이 경로에서만 조회/저장한다(PRD §6.8).
   */
  async generateTemp(dto: CreateTripDto): Promise<TempTripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );
    const cacheKey = buildTripCacheKey(dto);
    const itinerary = await this.resolveItinerary(dto, durationDays, cacheKey);

    return this.toTempResponseDto(dto, durationDays, itinerary);
  }

  /**
   * POST /api/trips/regenerate (PRD §6.2.3, §9)
   * 임시 전체 재생성. 입력값은 유지하되 캐시를 항상 우회하고 AI를 새로 호출한다
   * (§8.3 "함께 보내는 days[]는 무시"). DB 저장 없음.
   */
  async regenerateTemp(dto: CreateTripDto): Promise<TempTripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );
    const itinerary = await this.itineraryGeneratorService.generate(
      dto,
      durationDays,
    );

    return this.toTempResponseDto(dto, durationDays, itinerary);
  }

  /**
   * PATCH /api/trips/reorder (PRD §6.3.1, §8.2, §9)
   * 임시 활동 순서 변경. 서버는 요청 바디의 days[]에서 대상 day만 읽어 재계산하고,
   * 나머지 day는 손대지 않은 채 그대로 relay한다 — 이 구조 자체가 핵심 불변 규칙
   * (요청한 day 외 수정 금지)을 구조적으로 보장한다(CLAUDE.md). DB 저장 없음,
   * ai_response_cache도 조회/저장하지 않는다(PRD §6.8, 최초 생성 전용).
   */
  async reorderTemp(dto: ReorderTempDto): Promise<TempTripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );

    if (dto.day < 1 || dto.day > durationDays) {
      throw new AppException(
        'VALIDATION_ERROR',
        `day는 1~${durationDays} 범위여야 합니다.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const targetDayInput = dto.days.find((day) => day.day === dto.day);
    if (!targetDayInput) {
      throw new AppException(
        'VALIDATION_ERROR',
        '해당 일차의 일정 데이터를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentKeys = targetDayInput.activities.map(
      (activity) => activity.id,
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
      targetDayInput.activities.map((activity) => [activity.id, activity]),
    );
    const reorderedActivities: GeneratedActivity[] = dto.new_activity_order.map(
      (key) => TripsService.toGeneratedActivityFromInput(activityByKey.get(key)!),
    );

    const reorderInput: ReorderDayInput = {
      destination: dto.destination,
      activityTimeStart: dto.activity_time_start,
      activityTimeEnd: dto.activity_time_end,
      dayNumber: dto.day,
      theme: targetDayInput.theme,
      activities: reorderedActivities,
    };

    const result = await this.itineraryReorderService.reorderDay(reorderInput);

    const resultKeys = result.activities.map(
      (activity) => activity.activityKey,
    );
    if (!TripsService.arraysHaveSameElements(currentKeys, resultKeys)) {
      this.logger.error(
        `임시 재조정 응답 activity 집합이 원본과 다릅니다(day=${dto.day}). 요청하지 않은 변경을 방지하기 위해 실패로 처리합니다.`,
      );
      throw new AppException(
        'GENERATION_FAILED',
        '재조정 결과 검증에 실패했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const updatedDay: TripDayDto = {
      day: dto.day,
      theme: result.theme,
      activities: result.activities.map((activity) =>
        TripsService.toActivityDtoFromGenerated(activity),
      ),
      last_modified: true,
      route_warning: {
        flagged: result.routeWarning.flagged,
        reason: result.routeWarning.reason,
      },
    };

    const days = dto.days.map((day) =>
      day.day === dto.day
        ? updatedDay
        : TripsService.toRelayedDayDto(day),
    );

    return {
      destination: dto.destination,
      duration_days: durationDays,
      summary: dto.summary ?? null,
      preferences: dto.preferences,
      days,
      meta: { generated_at: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/trips/regenerate-day (PRD §6.3.2, §8.2, §9)
   * 임시 일자별 활동 교체. 다른 day 정보는 요청에 포함된 days[]에서 서버가 직접
   * 추출한다(별도 DB 조회 없음). 대상 day만 새 활동으로 교체하고 나머지는 그대로
   * relay한다(핵심 불변 규칙). DB 저장 없음.
   */
  async regenerateDayTemp(
    dto: RegenerateDayTempDto,
  ): Promise<TempTripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );

    if (dto.day < 1 || dto.day > durationDays) {
      throw new AppException(
        'VALIDATION_ERROR',
        `day는 1~${durationDays} 범위여야 합니다.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const targetDayInput = dto.days.find((day) => day.day === dto.day);
    if (!targetDayInput) {
      throw new AppException(
        'VALIDATION_ERROR',
        '해당 일차의 일정 데이터를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const otherDaysInput = dto.days.filter((day) => day.day !== dto.day);

    const regenerateInput: RegenerateDayInput = {
      destination: dto.destination,
      budgetLevel: dto.budget_level,
      activityTimeStart: dto.activity_time_start,
      activityTimeEnd: dto.activity_time_end,
      companion: dto.companion,
      preferences: dto.preferences,
      durationDays,
      targetDay: {
        dayNumber: dto.day,
        theme: targetDayInput.theme ?? '',
      },
      otherDays: otherDaysInput.map((day) => ({
        dayNumber: day.day,
        theme: day.theme ?? '',
        activities: day.activities.map((activity) => ({
          title: activity.title,
          location: activity.location ?? '',
        })),
      })),
    };

    const result =
      await this.itineraryRegenerateService.regenerateDay(regenerateInput);

    const updatedDay: TripDayDto = {
      day: dto.day,
      theme: result.theme,
      activities: result.activities.map((activity) => ({
        id: activity.id,
        time: TripsService.normalizeTime(activity.time),
        title: activity.title,
        description: activity.description,
        category: activity.category,
        duration_minutes: activity.durationMinutes,
        location: activity.location,
        estimated_cost: activity.estimatedCost,
        tips: activity.tips,
      })),
      last_modified: true,
      route_warning: {
        flagged: result.routeWarning.flagged,
        reason: result.routeWarning.reason,
      },
    };

    const days = dto.days.map((day) =>
      day.day === dto.day
        ? updatedDay
        : TripsService.toRelayedDayDto(day),
    );

    return {
      destination: dto.destination,
      duration_days: durationDays,
      summary: dto.summary ?? null,
      preferences: dto.preferences,
      days,
      meta: { generated_at: new Date().toISOString() },
    };
  }

  /**
   * POST /api/trips (저장, PRD §6.2.2, §9 / v2.5 "임시 조정 → 명시적 저장")
   * AI를 호출하지 않는다 — 프론트가 sessionStorage에 들고 있던 임시 일정(days[])을
   * 그대로 영속화한다. day 범위(1~duration_days 전부, 중복/누락 없이)와 activity
   * 필수 필드는 class-validator(SaveTripDto)와 아래 구조 검증으로 이중 확인한다.
   * ai_response_cache는 이 경로에서 전혀 건드리지 않는다(PRD §6.8, 최초 생성 전용).
   */
  async save(dto: SaveTripDto, userId: string): Promise<TripResponseDto> {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );

    this.assertDaysCoverDuration(dto.days, durationDays);

    const itinerary: GeneratedItinerary = {
      summary: dto.summary ?? null,
      days: dto.days
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((day) => ({
          dayNumber: day.day,
          theme: day.theme ?? null,
          activities: day.activities.map((activity) =>
            TripsService.toGeneratedActivityFromInput(activity),
          ),
          routeWarningFlagged: day.route_warning?.flagged ?? false,
          routeWarningReason: day.route_warning?.reason ?? null,
        })),
    };

    const { trip, days } = await this.persistTrip(
      dto,
      userId,
      durationDays,
      itinerary,
    );

    return this.toResponseDto(trip, days);
  }

  /**
   * 저장 요청(days[])의 day 번호가 1~durationDays를 중복/누락 없이 정확히 채우는지
   * 검증한다(PRD §9 "day 범위·activity 필수 필드는 서버가 구조 검증"). activity의
   * title/category 등 필수 필드 자체는 SaveTripDto(class-validator)가 이미 강제한다.
   */
  private assertDaysCoverDuration(
    days: TripDayInputDto[],
    durationDays: number,
  ): void {
    const dayNumbers = days.map((day) => day.day).sort((a, b) => a - b);
    const expected = Array.from({ length: durationDays }, (_, i) => i + 1);
    const matches =
      dayNumbers.length === expected.length &&
      dayNumbers.every((value, index) => value === expected[index]);

    if (!matches) {
      throw new AppException(
        'VALIDATION_ERROR',
        `days는 1~${durationDays}일차를 중복/누락 없이 모두 포함해야 합니다.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * GET /api/trips (PRD §9 "내 저장 목록(최신순)")
   * 1) user_id로 본인 소유 trip만 필터링(다른 사용자의 trip은 절대 노출하지 않는다)
   * 2) updated_at DESC로 정렬(ERD §5 인덱스 제안: 재조정이 일어나면 trip이 갱신되므로,
   *    최근에 만들었거나 마지막으로 수정한 여행이 목록 위쪽에 오도록 updated_at 기준 채택)
   * 3) 카드 UI에 필요한 필드만 담은 경량 DTO(TripListItemDto)로 반환하고,
   *    day/activity 상세는 내려주지 않는다(상세는 GET /trips/{id}에서 별도 조회)
   * 4) route_warning(flagged)은 관리자 전용이 아니라 사용자 화면에도 즉시 노출해야 하므로
   *    (CLAUDE.md 핵심 규칙), trip마다 route_warning_flagged=true인 day 수를 집계해 포함한다
   */
  async findAll(userId: string): Promise<TripListItemDto[]> {
    const rows = await this.tripsRepository
      .createQueryBuilder('trip')
      .leftJoin('trip.itineraryDays', 'day')
      .select('trip.id', 'tripId')
      .addSelect('trip.destination', 'destination')
      .addSelect("to_char(trip.startDate, 'YYYY-MM-DD')", 'startDate')
      .addSelect("to_char(trip.endDate, 'YYYY-MM-DD')", 'endDate')
      .addSelect('trip.summary', 'summary')
      .addSelect('trip.createdAt', 'createdAt')
      .addSelect('trip.updatedAt', 'updatedAt')
      .addSelect(
        'COUNT(day.id) FILTER (WHERE day.routeWarningFlagged = true)',
        'flaggedDaysCount',
      )
      .where('trip.userId = :userId', { userId })
      .groupBy('trip.id')
      .orderBy('trip.updatedAt', 'DESC')
      .getRawMany<{
        tripId: string;
        destination: string;
        startDate: string;
        endDate: string;
        summary: string | null;
        createdAt: Date;
        updatedAt: Date;
        flaggedDaysCount: string;
      }>();

    return rows.map((row) => ({
      trip_id: row.tripId,
      destination: row.destination,
      start_date: row.startDate,
      end_date: row.endDate,
      summary: row.summary,
      flagged_days_count: Number(row.flaggedDaysCount),
      created_at: new Date(row.createdAt).toISOString(),
      updated_at: new Date(row.updatedAt).toISOString(),
    }));
  }

  /**
   * GET /api/trips/{trip_id} (PRD §9 "저장된 일정 상세")
   * 목록 화면 카드 클릭 시 진입. §8.3 스키마 전체(days/activities 포함)를 반환한다.
   * 소유권 확인은 regenerate()/reorder()와 동일 패턴(404 → 403 순서).
   */
  async findOne(tripId: string, userId: string): Promise<TripResponseDto> {
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
        '본인 소유의 일정만 조회할 수 있습니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.toResponseDto(trip, trip.itineraryDays ?? []);
  }

  /**
   * POST /api/trips/{trip_id}/regenerate — 전체 재생성 미리보기 (PRD §6.2.2, §6.2.3,
   * §8.3 "주의", §9, v2.6 - 미리보기 전용)
   * 1) 원본 trip 로드 및 소유권 확인
   * 2) 저장된 입력값(destination/기간/예산/활동시간/동반인/취향)은 그대로 유지
   * 3) ai_response_cache를 조회/저장하지 않고 itineraryGeneratorService.generate()를
   *    직접 호출(캐시는 최초 생성에만 적용, PRD §6.8, 캐시는 항상 무시)
   * 4) DB에는 전혀 반영하지 않는다 — 저장 전까지는 어떤 trip에도 속하지 않는 완전히
   *    새로운 내용이므로 trip_id/meta.revision이 없는 TempTripResponseDto로 반환한다
   *    (PRD §8.3 "주의"). 원본 trip row는 이 요청만으로는 절대 바뀌지 않는다. 마음에
   *    들면 POST /trips/{trip_id}/regenerate/save로 커밋해야 새 trip_id가 생성된다.
   */
  async regenerate(
    tripId: string,
    userId: string,
  ): Promise<TempTripResponseDto> {
    const trip = await this.tripsRepository.findOne({
      where: { id: tripId },
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
        '본인 소유의 일정만 재생성할 수 있습니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    const dto = this.toCreateTripDtoFromTrip(trip);

    const itinerary = await this.itineraryGeneratorService.generate(
      dto,
      trip.durationDays,
    );

    return this.toTempResponseDto(dto, trip.durationDays, itinerary);
  }

  /**
   * POST /api/trips/{trip_id}/regenerate/save (신규, PRD §6.2.2, §6.2.3, §8.2, §9, v2.6)
   * 전체 재생성 미리보기(regenerate()) 결과를 새로운 trip으로 커밋한다. AI를 다시
   * 호출하지 않고 미리보기 응답으로 받은 summary/days[]를 그대로 저장한다(save()와
   * 동일 패턴 — persistTrip() 재사용). 원본 trip의 저장된 입력값을 그대로 재사용하되,
   * 원본 trip row는 전혀 건드리지 않는다("현재의 저장방식" 그대로: 항상 새 trip_id).
   */
  async regenerateSave(
    tripId: string,
    dto: RegenerateSaveDto,
    userId: string,
  ): Promise<TripResponseDto> {
    const trip = await this.tripsRepository.findOne({
      where: { id: tripId },
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
        '본인 소유의 일정만 저장할 수 있습니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    this.assertDaysCoverDuration(dto.days, trip.durationDays);

    const createDto = this.toCreateTripDtoFromTrip(trip);

    const itinerary: GeneratedItinerary = {
      summary: dto.summary ?? null,
      days: dto.days
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((day) => ({
          dayNumber: day.day,
          theme: day.theme ?? null,
          activities: day.activities.map((activity) =>
            TripsService.toGeneratedActivityFromInput(activity),
          ),
          routeWarningFlagged: day.route_warning?.flagged ?? false,
          routeWarningReason: day.route_warning?.reason ?? null,
        })),
    };

    const { trip: newTrip, days } = await this.persistTrip(
      createDto,
      userId,
      trip.durationDays,
      itinerary,
    );

    return this.toResponseDto(newTrip, days);
  }

  /**
   * 저장된 trip 엔티티의 값을 §8.1 입력 스키마(CreateTripDto)로 재구성한다.
   * regenerate()(미리보기)/regenerateSave()(커밋) 양쪽에서 "저장된 입력값 그대로
   * 유지"(PRD §6.2.3)를 위해 공유한다.
   */
  private toCreateTripDtoFromTrip(trip: Trip): CreateTripDto {
    return {
      destination: trip.destination,
      start_date: trip.startDate,
      end_date: trip.endDate,
      budget_level: trip.budgetLevel,
      activity_time_start:
        TripsService.normalizeTime(trip.activityTimeStart) ??
        trip.activityTimeStart,
      activity_time_end:
        TripsService.normalizeTime(trip.activityTimeEnd) ??
        trip.activityTimeEnd,
      companion: trip.companion,
      preferences: trip.preferences as Preference[],
    };
  }

  /**
   * PATCH /api/trips/{trip_id}/reorder — 활동 순서 변경 미리보기 (PRD §6.3.1, §8.2, §9,
   * v2.6 - 미리보기 전용)
   * 1) 소유권/day 범위 검증. destination/활동시간대/durationDays는 DB의 trip에서 조회한다
   *    (정적 값이라 프론트가 다시 보낼 필요 없음).
   * 2) 대상 day의 "현재 활동 집합" 검증과 재정렬 입력은 DB가 아니라 요청받은 dto.days에서
   *    찾는다(reorderTemp()와 동일 패턴) — 같은 세션에서 다른 day를 먼저 미리보기했을 수
   *    있으므로 그 상태를 잃지 않기 위함이다.
   * 3) ItineraryReorderService(ai-specialist 담당)가 해당 day만 재계산
   * 4) 응답 activity 집합을 원본과 다시 대조(2차 방어선) → 불일치 시 GENERATION_FAILED
   * 5) DB에는 전혀 반영하지 않는다 — 대상 day만 재계산 결과로 교체하고 나머지는
   *    dto.days에서 받은 그대로 relay한다. trip_id는 그대로, meta.revision은 DB에 저장된
   *    현재 값 그대로 반환한다(증가시키지 않음). 실제 반영은 POST /trips/{trip_id}/save.
   * 6) ai_response_cache는 조회/저장하지 않는다(PRD §6.8, 최초 생성 전용)
   */
  async reorder(
    tripId: string,
    dto: ReorderTripDto,
    userId: string,
  ): Promise<TripResponseDto> {
    const trip = await this.tripsRepository.findOne({
      where: { id: tripId },
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

    const targetDayInput = dto.days.find((day) => day.day === dto.day);
    if (!targetDayInput) {
      throw new AppException(
        'VALIDATION_ERROR',
        '해당 일차의 일정 데이터를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentKeys = targetDayInput.activities.map(
      (activity) => activity.id,
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
      targetDayInput.activities.map((activity) => [activity.id, activity]),
    );
    const reorderedActivities: GeneratedActivity[] = dto.new_activity_order.map(
      (key) => TripsService.toGeneratedActivityFromInput(activityByKey.get(key)!),
    );

    const reorderInput: ReorderDayInput = {
      destination: trip.destination,
      activityTimeStart:
        TripsService.normalizeTime(trip.activityTimeStart) ??
        trip.activityTimeStart,
      activityTimeEnd:
        TripsService.normalizeTime(trip.activityTimeEnd) ??
        trip.activityTimeEnd,
      dayNumber: dto.day,
      theme: targetDayInput.theme ?? null,
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

    const updatedDay: TripDayDto = {
      day: dto.day,
      theme: result.theme,
      activities: result.activities.map((activity) =>
        TripsService.toActivityDtoFromGenerated(activity),
      ),
      last_modified: true,
      route_warning: {
        flagged: result.routeWarning.flagged,
        reason: result.routeWarning.reason,
      },
    };

    const days = dto.days.map((day) =>
      day.day === dto.day ? updatedDay : TripsService.toRelayedDayDto(day),
    );

    return {
      trip_id: trip.id,
      destination: trip.destination,
      duration_days: trip.durationDays,
      summary: trip.summary,
      preferences: trip.preferences,
      days,
      meta: { generated_at: new Date().toISOString(), revision: trip.revision },
    };
  }

  /**
   * PATCH /api/trips/{trip_id}/regenerate-day — 일자별 활동 교체 미리보기 (PRD §6.3.2,
   * §8.2, §9, v2.6 - 미리보기 전용)
   * 1) 소유권/day 범위 검증(reorder()와 동일 방식). budgetLevel/companion/preferences/
   *    durationDays 등은 DB의 trip에서 조회한다.
   * 2) 다른 day들의 활동(title/location)은 DB가 아니라 요청받은 dto.days에서 서버가
   *    직접 추출한다(regenerateDayTemp()와 동일 패턴) — 프론트가 아직 저장 전인 다른
   *    day의 조정 내용까지 반영하기 위함이다(ItineraryRegenerateService, ai-specialist 담당)
   * 3) DB에는 전혀 반영하지 않는다 — 대상 day만 새 활동으로 교체하고 나머지는 dto.days에서
   *    받은 그대로 relay한다. trip_id는 그대로, meta.revision은 DB에 저장된 현재 값 그대로
   *    반환한다(증가시키지 않음). 실제 반영은 POST /trips/{trip_id}/save.
   * 4) ai_response_cache는 조회/저장하지 않는다(PRD §6.8, 최초 생성 전용)
   */
  async regenerateDay(
    tripId: string,
    dto: RegenerateDayDto,
    userId: string,
  ): Promise<TripResponseDto> {
    const trip = await this.tripsRepository.findOne({
      where: { id: tripId },
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
        '본인 소유의 일정만 재생성할 수 있습니다.',
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

    const targetDayInput = dto.days.find((day) => day.day === dto.day);
    if (!targetDayInput) {
      throw new AppException(
        'VALIDATION_ERROR',
        '해당 일차의 일정 데이터를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const otherDaysInput = dto.days.filter((day) => day.day !== dto.day);

    const regenerateInput: RegenerateDayInput = {
      destination: trip.destination,
      budgetLevel: trip.budgetLevel,
      activityTimeStart:
        TripsService.normalizeTime(trip.activityTimeStart) ??
        trip.activityTimeStart,
      activityTimeEnd:
        TripsService.normalizeTime(trip.activityTimeEnd) ??
        trip.activityTimeEnd,
      companion: trip.companion,
      preferences: trip.preferences,
      durationDays: trip.durationDays,
      targetDay: {
        dayNumber: dto.day,
        theme: targetDayInput.theme ?? '',
      },
      otherDays: otherDaysInput.map((day) => ({
        dayNumber: day.day,
        theme: day.theme ?? '',
        activities: day.activities.map((activity) => ({
          title: activity.title,
          location: activity.location ?? '',
        })),
      })),
    };

    const result =
      await this.itineraryRegenerateService.regenerateDay(regenerateInput);

    const updatedDay: TripDayDto = {
      day: dto.day,
      theme: result.theme,
      activities: result.activities.map((activity) => ({
        id: activity.id,
        time: TripsService.normalizeTime(activity.time),
        title: activity.title,
        description: activity.description,
        category: activity.category,
        duration_minutes: activity.durationMinutes,
        location: activity.location,
        estimated_cost: activity.estimatedCost,
        tips: activity.tips,
      })),
      last_modified: true,
      route_warning: {
        flagged: result.routeWarning.flagged,
        reason: result.routeWarning.reason,
      },
    };

    const days = dto.days.map((day) =>
      day.day === dto.day ? updatedDay : TripsService.toRelayedDayDto(day),
    );

    return {
      trip_id: trip.id,
      destination: trip.destination,
      duration_days: trip.durationDays,
      summary: trip.summary,
      preferences: trip.preferences,
      days,
      meta: { generated_at: new Date().toISOString(), revision: trip.revision },
    };
  }

  /**
   * POST /api/trips/{trip_id}/save (신규, PRD §6.2.2, §8.2, §9, v2.6)
   * day 단위 미리보기(reorder()/regenerateDay())로 누적된 로컬 변경을 같은 trip_id에
   * 한 번에 반영한다.
   * 1) 소유권 확인
   * 2) days[]가 1~duration_days를 중복/누락 없이 정확히 포함하는지 검증(save()의
   *    assertDaysCoverDuration()과 동일)
   * 3) 트랜잭션 내에서 요청받은 모든 day의 ItineraryActivity를 삭제 후 재삽입하고
   *    theme/route_warning/lastModifiedAt을 갱신한다(persistFullDaysUpdate())
   * 4) trip.revision은 이번 커밋 전체에 대해 딱 1번만 증가시킨다(day가 몇 개
   *    바뀌었든 상관없이). changedDayNumber는 특정할 수 없으므로 최초 생성과 동일하게
   *    null로 스냅샷을 남긴다.
   */
  async saveExisting(
    tripId: string,
    dto: SaveTripDaysDto,
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
        '본인 소유의 일정만 저장할 수 있습니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    this.assertDaysCoverDuration(dto.days, trip.durationDays);

    const { trip: updatedTrip, days } = await this.persistFullDaysUpdate(
      trip,
      dto.days,
    );

    return this.toResponseDto(updatedTrip, days);
  }

  /**
   * POST /trips/{trip_id}/save 전용: 요청받은 모든 day의 활동을 삭제 후 재삽입하고,
   * trip.revision은 이 커밋 전체에 대해 딱 1번만 증가시킨다. assertDaysCoverDuration()이
   * 이미 daysInput이 1~durationDays를 중복/누락 없이 포함함을 보장하므로, trip의 모든
   * ItineraryDay가 이 루프에서 정확히 한 번씩 갱신된다(다른 day 행은 아예 조회하지 않음).
   */
  private async persistFullDaysUpdate(
    trip: Trip,
    daysInput: TripDayInputDto[],
  ): Promise<{ trip: Trip; days: ItineraryDay[] }> {
    try {
      return await this.tripsRepository.manager.transaction(async (manager) => {
        const existingDayByNumber = new Map(
          (trip.itineraryDays ?? []).map((day) => [day.dayNumber, day]),
        );

        const savedDays: ItineraryDay[] = [];
        for (const dayInput of daysInput) {
          const existingDay = existingDayByNumber.get(dayInput.day);
          if (!existingDay) {
            throw new AppException(
              'VALIDATION_ERROR',
              `해당 일차(day=${dayInput.day})의 일정 데이터를 찾을 수 없습니다.`,
              HttpStatus.BAD_REQUEST,
            );
          }

          const existingActivityIds = (existingDay.activities ?? []).map(
            (activity) => activity.id,
          );
          if (existingActivityIds.length > 0) {
            await manager.delete(ItineraryActivity, existingActivityIds);
          }

          const newActivityEntities = dayInput.activities.map(
            (activity, index) =>
              manager.create(ItineraryActivity, {
                itineraryDayId: existingDay.id,
                activityKey: activity.id,
                orderIndex: index,
                time: activity.time,
                title: activity.title,
                description: activity.description,
                category: activity.category,
                durationMinutes: activity.duration_minutes,
                location: activity.location,
                estimatedCost: activity.estimated_cost,
                tips: activity.tips,
              }),
          );

          const savedActivities = await manager.save(
            ItineraryActivity,
            newActivityEntities,
          );

          existingDay.theme = dayInput.theme ?? null;
          existingDay.routeWarningFlagged =
            dayInput.route_warning?.flagged ?? false;
          existingDay.routeWarningReason =
            dayInput.route_warning?.reason ?? null;
          if (dayInput.last_modified) {
            existingDay.lastModifiedAt = new Date();
          }
          existingDay.activities = savedActivities;

          savedDays.push(await manager.save(ItineraryDay, existingDay));
        }

        trip.revision += 1;
        const savedTrip = await manager.save(Trip, trip);

        await manager.save(
          TripRevision,
          manager.create(TripRevision, {
            tripId: savedTrip.id,
            revisionNumber: savedTrip.revision,
            changedDayNumber: null,
            daysSnapshot: this.toResponseDays(savedDays),
          }),
        );

        return { trip: savedTrip, days: savedDays };
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(
        `trips 저장(day 커밋) 실패: ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new AppException(
        'STORAGE_ERROR',
        '일정을 저장하는 중 오류가 발생했습니다.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 임시 조정 요청 바디(TripActivityInputDto, snake_case)를 ItineraryReorderService/
   * ItineraryRegenerateService가 요구하는 GeneratedActivity(camelCase)로 변환한다.
   */
  private static toGeneratedActivityFromInput(
    activity: TripActivityInputDto,
  ): GeneratedActivity {
    return {
      activityKey: activity.id,
      time: activity.time ?? null,
      title: activity.title,
      description: activity.description ?? null,
      category: activity.category,
      durationMinutes: activity.duration_minutes ?? null,
      location: activity.location ?? null,
      estimatedCost: activity.estimated_cost ?? null,
      tips: activity.tips ?? null,
    };
  }

  /** GeneratedActivity(camelCase)를 §8.3 응답 스키마(snake_case)로 매핑한다. */
  private static toActivityDtoFromGenerated(activity: GeneratedActivity) {
    return {
      id: activity.activityKey,
      time: TripsService.normalizeTime(activity.time),
      title: activity.title,
      description: activity.description,
      category: activity.category,
      duration_minutes: activity.durationMinutes,
      location: activity.location,
      estimated_cost: activity.estimatedCost,
      tips: activity.tips,
    };
  }

  /**
   * 임시 조정(reorder/regenerate-day)에서 대상 day가 아닌 나머지 day는 서버가 아예
   * 읽지 않고 요청받은 그대로 relay한다(핵심 불변 규칙). 입력 DTO(TripDayInputDto)를
   * 응답 DTO(TripDayDto) 모양으로 그대로 옮겨 담기만 한다.
   */
  private static toRelayedDayDto(day: TripDayInputDto): TripDayDto {
    return {
      day: day.day,
      theme: day.theme ?? null,
      activities: day.activities.map((activity) => ({
        id: activity.id,
        time: activity.time ?? null,
        title: activity.title,
        description: activity.description ?? null,
        category: activity.category,
        duration_minutes: activity.duration_minutes ?? null,
        location: activity.location ?? null,
        estimated_cost: activity.estimated_cost ?? null,
        tips: activity.tips ?? null,
      })),
      last_modified: day.last_modified ?? false,
      route_warning: {
        flagged: day.route_warning?.flagged ?? false,
        reason: day.route_warning?.reason ?? null,
      },
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
      preferences: trip.preferences,
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

  /**
   * 임시(저장 전) 엔드포인트(generateTemp/regenerateTemp) 공용 응답 매핑.
   * trip_id/meta.revision이 없는 §8.3 스키마(TempTripResponseDto)로 변환한다.
   * GeneratedItinerary(camelCase, AI 생성 직후 결과)를 그대로 입력받으므로,
   * 엔티티를 거치는 toResponseDays()와 별도의 경량 매핑 함수로 둔다.
   */
  private toTempResponseDto(
    dto: CreateTripDto,
    durationDays: number,
    itinerary: GeneratedItinerary,
  ): TempTripResponseDto {
    return {
      destination: dto.destination,
      duration_days: durationDays,
      summary: itinerary.summary,
      preferences: dto.preferences,
      days: this.toResponseDaysFromGenerated(itinerary.days),
      meta: { generated_at: new Date().toISOString() },
    };
  }

  /** GeneratedDay[](camelCase, AI 생성 직후)를 §8.3 응답 스키마(snake_case)로 매핑한다. */
  private toResponseDaysFromGenerated(days: GeneratedDay[]): TripDayDto[] {
    return days
      .slice()
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => ({
        day: day.dayNumber,
        theme: day.theme,
        activities: day.activities.map((activity) =>
          TripsService.toActivityDtoFromGenerated(activity),
        ),
        last_modified: false,
        route_warning: {
          flagged: day.routeWarningFlagged,
          reason: day.routeWarningReason,
        },
      }));
  }
}
