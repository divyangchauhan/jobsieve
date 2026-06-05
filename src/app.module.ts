import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdaptersModule } from './adapters/adapters.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validate } from './config/env.validation.js';
import { Job } from './jobs/job.entity.js';
import { JobsModule } from './jobs/jobs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3' as const,
        database: process.env['DATABASE_PATH'] ?? './data/jobsieve.sqlite',
        entities: [Job],
        synchronize: true,
        logging: false,
      }),
    }),
    JobsModule,
    AdaptersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
