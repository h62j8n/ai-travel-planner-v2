import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { Trip } from './entities/trip.entity';
import { ItineraryDay } from './entities/itinerary-day.entity';
import { ItineraryActivity } from './entities/itinerary-activity.entity';
import { TripRevision } from './entities/trip-revision.entity';
import { AiResponseCache } from './entities/ai-response-cache.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trip,
      ItineraryDay,
      ItineraryActivity,
      TripRevision,
      AiResponseCache,
    ]),
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
