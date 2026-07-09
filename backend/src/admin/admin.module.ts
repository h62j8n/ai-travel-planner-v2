import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PromptTemplate } from './entities/prompt-template.entity';
import { ItineraryDay } from '../trips/entities/itinerary-day.entity';
import { Trip } from '../trips/entities/trip.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PromptTemplate, ItineraryDay, Trip])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
