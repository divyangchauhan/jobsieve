import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotionModule } from '../notion/notion.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { Job } from './job.entity.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    NotionModule,
    ProfileModule,
    ScoringModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [TypeOrmModule],
})
export class JobsModule {}
