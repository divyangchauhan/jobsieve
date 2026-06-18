import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Job } from '../jobs/job.entity.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { ProfileController } from './profile.controller.js';
import { Profile } from './profile.entity.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Profile, Job]), ScoringModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
