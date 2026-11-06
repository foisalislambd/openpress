import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { MediaService } from './media/media.service';
import { ToolsService } from './tools/tools.service';
import { redisConnection, redisUrl } from './jobs/queue';

async function main() {
  if (!redisUrl()) {
    console.error('REDIS_URL is not set. The worker has nothing to consume.');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const tools = app.get(ToolsService);
  const media = app.get(MediaService);
  const connection = redisConnection();
  if (!connection) process.exit(1);

  const imports = new Worker(
    'imports',
    async (job) => {
      const jobId = String((job.data as { jobId?: string }).jobId ?? '');
      if (!jobId) return;
      await tools.runQueuedImport(jobId);
    },
    { connection },
  );
  const images = new Worker(
    'media',
    async (job) => {
      const mediaId = String((job.data as { mediaId?: string }).mediaId ?? '');
      if (!mediaId) return;
      await media.regenerate(mediaId);
    },
    { connection },
  );
  const shutdown = async () => {
    await imports.close();
    await images.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  console.log('OpenPress worker listening on imports and media');
}

void main();
