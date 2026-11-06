import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const server = express();
  server.use((req, _res, next) => {
    const url = req.url ?? '';
    if (url === '/wp-json' || url.startsWith('/wp-json/')) {
      req.url = `/api${url.slice('/wp-json'.length) || '/'}`;
    }
    next();
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix('api');
  // In production set WEB_ORIGIN (e.g. https://mysite.com) to lock down CORS
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'), {
    prefix: '/uploads',
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`OpenPress API running on http://localhost:${port}/api`);
}
bootstrap();
