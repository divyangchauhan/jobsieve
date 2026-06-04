import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Job } from './job.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  exports: [TypeOrmModule],
})
export class JobsModule {}
