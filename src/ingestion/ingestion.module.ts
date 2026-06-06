import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Job } from '../jobs/job.entity.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
