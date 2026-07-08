import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PromptTemplate } from './entities/prompt-template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PromptTemplate])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
