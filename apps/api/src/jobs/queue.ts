import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const queues = new Map<string, Queue>();
let connection: IORedis | null = null;

export function redisUrl() {
  return process.env.REDIS_URL?.trim() || '';
}

export function redisConnection() {
  const url = redisUrl();
  if (!url) return null;
  if (!connection) {
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export async function enqueue(name: string, data: Record<string, unknown>) {
  const conn = redisConnection();
  if (!conn) return false;
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: conn });
    queues.set(name, queue);
  }
  await queue.add(name, data, { removeOnComplete: 200, removeOnFail: 200 });
  return true;
}
