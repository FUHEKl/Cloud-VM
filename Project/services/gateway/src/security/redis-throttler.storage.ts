import Redis from "ioredis";

export class RedisThrottlerStorage {
  private readonly redis = new Redis(
    process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`,
    {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    },
  );

  // SECURITY: Redis-backed storage for @nestjs/throttler so counters survive process restarts.
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    if (this.redis.status !== "ready") {
      await this.redis.connect();
    }

    const fullKey = `security:gateway:throttler:${key}`;
    const totalHits = await this.redis.incr(fullKey);

    if (totalHits === 1) {
      await this.redis.pexpire(fullKey, ttl);
    }

    const timeToExpire = Math.max(0, await this.redis.pttl(fullKey));
    const isBlocked = totalHits > limit;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
