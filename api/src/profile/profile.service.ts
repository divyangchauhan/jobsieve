import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Job } from '../jobs/job.entity.js';
import { FitScoringService } from '../scoring/fit-scoring.service.js';
import { buildDefaultProfile } from './default-profile.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { PROFILE_ID, Profile } from './profile.entity.js';

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly scoring: FitScoringService,
  ) {}

  // Seed the default profile on first run so the app works out of the box.
  async onModuleInit(): Promise<void> {
    await this.getProfile();
  }

  // Returns the singleton profile, seeding the default on first access.
  async getProfile(): Promise<Profile> {
    const existing = await this.profileRepo.findOneBy({ id: PROFILE_ID });
    if (existing !== null) return existing;
    return this.profileRepo.save(buildDefaultProfile());
  }

  // Persist the edited profile and rescore every stored job against it so the
  // fit_score column stays truthful (the explicit fallback for read-time scoring).
  async update(dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.getProfile();
    Object.assign(profile, dto);
    const saved = await this.profileRepo.save(profile);
    await this.rescoreAll(saved);
    return saved;
  }

  // Recompute fit_score for all jobs using the given profile.
  async rescoreAll(profile: Profile): Promise<void> {
    const jobs = await this.jobRepo.find();
    for (const job of jobs) {
      const fitScore = this.scoring.score(job, profile);
      if (fitScore !== job.fit_score) {
        await this.jobRepo.update(job.id, { fit_score: fitScore });
      }
    }
    this.logger.log(`Rescored ${jobs.length} jobs`);
  }
}
