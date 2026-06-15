import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdaptersModule } from '../adapters/adapters.module.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { Job } from '../jobs/job.entity.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { CronOrchestratorService } from './cron-orchestrator.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    AdaptersModule,
    IngestionModule,
    ScoringModule,
    ProfileModule,
  ],
  providers: [CronOrchestratorService],
  exports: [CronOrchestratorService],
})
export class CronModule {}
