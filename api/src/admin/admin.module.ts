import { Module } from '@nestjs/common';

import { CronModule } from '../cron/cron.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [CronModule],
  controllers: [AdminController],
})
export class AdminModule {}
