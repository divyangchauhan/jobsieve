import { Module } from '@nestjs/common';

import { FitScoringService } from './fit-scoring.service.js';

@Module({
  providers: [FitScoringService],
  exports: [FitScoringService],
})
export class ScoringModule {}
