import IORedis, { type Redis } from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var __yelliRedis: Redis | undefined;
}

function buildRedisUrl(): string {
  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('REDIS_URL is not set. Required for BullMQ queue + worker connection.');
  }
  return url;
}

export function getRedisConnection(): Redis {
  if (!globalThis.__yelliRedis) {
    globalThis.__yelliRedis = new IORedis(buildRedisUrl(), {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: true,
    });
  }
  return globalThis.__yelliRedis;
}
