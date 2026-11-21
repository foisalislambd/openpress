import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { assertRuntimeConfig, corsOrigin } from './security/runtime-config';

async function bootstrap() {
  assertRuntimeConfig();
  const server = express();
  server.disable('x-powered-by');
  server.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    const url = req.url ?? '';
    if (url === '/wp-json' || url.startsWith('/wp-json/')) {
      req.url = `/api${url.slice('/wp-json'.length) || '/'}`;
    }
    next();
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin(),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-OpenPress-Site', 'X-OpenPress-CSRF', 'X-OpenPress-Client', 'X-OpenPress-Unlock', 'X-OpenPress-Host'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'), {
    prefix: '/uploads',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`OpenPress API running on http://localhost:${port}/api`);
}
bootstrap();
