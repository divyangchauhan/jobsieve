import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminModule } from './admin/admin.module.js';
import { AdaptersModule } from './adapters/adapters.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validate } from './config/env.validation.js';
import { CronModule } from './cron/cron.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { Job } from './jobs/job.entity.js';
import { JobsModule } from './jobs/jobs.module.js';
import { NotionModule } from './notion/notion.module.js';
import { Profile } from './profile/profile.entity.js';
import { ProfileModule } from './profile/profile.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
      validate,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3' as const,
        database: process.env['DATABASE_PATH'] ?? './data/jobsieve.sqlite',
        entities: [Job, Profile],
        synchronize: true,
        logging: false,
      }),
    }),
    JobsModule,
    ProfileModule,
    AdminModule,
    AdaptersModule,
    IngestionModule,
    CronModule,
    NotionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
