import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';

const STACK_SCORE = 2;
const SENIORITY_SCORE = 3;
const REMOTE_SCORE = 2;

@Injectable()
export class FitScoringService {
  private readonly stackKeywords: readonly string[];
  private readonly seniorityKeywords: readonly string[];

  constructor(private readonly config: ConfigService) {
    this.stackKeywords = this.parseKeywords(
      config.get<string>('STACK_KEYWORDS', ''),
    );
    this.seniorityKeywords = this.parseKeywords(
      config.get<string>('SENIORITY_KEYWORDS', ''),
    );
  }

  score(job: NormalizedJob): number {
    const text = `${job.title} ${job.description ?? ''}`.toLowerCase();
    let total = 0;

    for (const kw of this.stackKeywords) {
      if (text.includes(kw)) total += STACK_SCORE;
    }
    for (const kw of this.seniorityKeywords) {
      if (text.includes(kw)) total += SENIORITY_SCORE;
    }
    if (job.remote) total += REMOTE_SCORE;

    return total;
  }

  private parseKeywords(raw: string): string[] {
    return raw
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);
  }
}
