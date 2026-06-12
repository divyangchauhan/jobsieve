import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotionModule } from '../notion/notion.module.js';
import { Job } from './job.entity.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), NotionModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [TypeOrmModule],
})
export class JobsModule {}
