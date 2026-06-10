import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Job } from '../jobs/job.entity.js';
import { NotionSyncService } from './notion-sync.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  providers: [NotionSyncService],
  exports: [NotionSyncService],
})
export class NotionModule {}
