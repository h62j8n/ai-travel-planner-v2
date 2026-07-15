import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PromptTemplate } from './entities/prompt-template.entity';
import { ItineraryDay } from '../trips/entities/itinerary-day.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PromptTemplate, ItineraryDay, Trip]),
    // GET /admin/flagged/:tripId가 TripsService.findOneForAdmin()을 재사용하기 위해 import
    // (사용자용 GET /trips/:tripId와 동일한 매핑 로직을 중복 구현하지 않기 위함)
    TripsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
