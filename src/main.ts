import path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const frontendDist = path.join(process.cwd(), 'frontend', 'dist');
  app.useStaticAssets(frontendDist);

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.includes('.')
    ) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
      next();
    }
  });

  await app.listen(process.env['API_PORT'] ?? process.env['PORT'] ?? 3000);
}
void bootstrap();
