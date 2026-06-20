import path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3000;

export interface BootstrapOptions {
  /** Port to listen on. `0` asks the OS for an ephemeral port (desktop mode). */
  readonly port?: number;
  /** Interface to bind. Omit to bind all interfaces (standalone server mode). */
  readonly host?: string;
  /** Absolute path to the built frontend assets. Defaults to `cwd/frontend/dist`. */
  readonly frontendDist?: string;
}

export interface BootstrapResult {
  readonly app: NestExpressApplication;
  /** Loopback URL the UI/clients should hit, with the actual bound port. */
  readonly url: string;
  readonly port: number;
}

/**
 * Boots the NestJS application (API + static UI + SPA fallback) and starts
 * listening. Shared by the standalone server entrypoint (`main.ts`) and the
 * Electron desktop shell, which embeds this same process.
 */
export async function bootstrapApi(
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const frontendDist =
    options.frontendDist ?? path.join(process.cwd(), 'frontend', 'dist');
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

  const requestedPort =
    options.port ??
    Number(process.env['API_PORT'] ?? process.env['PORT'] ?? DEFAULT_PORT);

  if (options.host !== undefined) {
    await app.listen(requestedPort, options.host);
  } else {
    await app.listen(requestedPort);
  }

  const address = app.getHttpServer().address() as AddressInfo | string | null;
  const port =
    typeof address === 'object' && address !== null
      ? address.port
      : requestedPort;
  const host = options.host ?? 'localhost';
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;

  return { app, url, port };
}
