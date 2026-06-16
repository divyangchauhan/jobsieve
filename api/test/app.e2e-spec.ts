import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

// Must be set before AppModule imports so ConfigModule validation and
// TypeORM/CronOrchestrator initialise with valid values.
process.env['DATABASE_PATH'] = ':memory:';
process.env['CRON_SCHEDULE'] = '0 */4 * * *';
process.env['WEB3CAREER_TOKEN'] = 'test-token';
process.env['MIN_FIT_SCORE'] = '0';
process.env['STACK_KEYWORDS'] = 'typescript';
process.env['SENIORITY_KEYWORDS'] = 'senior';

import { AppModule } from './../src/app.module';

describe('Jobs API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  it('GET /api/jobs returns paginated result', () => {
    return request(app.getHttpServer())
      .get('/api/jobs')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page');
        expect(res.body).toHaveProperty('limit');
      });
  });

  it('GET /api/jobs/:id returns 404 for unknown id', () => {
    return request(app.getHttpServer()).get('/api/jobs/99999').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
