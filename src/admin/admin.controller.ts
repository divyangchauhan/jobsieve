import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CronOrchestratorService } from '../cron/cron-orchestrator.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly cron: CronOrchestratorService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  async ingest(): Promise<{ ok: boolean }> {
    await this.cron.runIngestion();
    return { ok: true };
  }
}
