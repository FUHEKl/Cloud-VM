import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ProxyModule } from "./proxy/proxy.module";
import { HealthController } from "./health.controller";
import { RedisThrottlerStorage } from "./security/redis-throttler.storage";

@Module({
  imports: [
    // SECURITY: global throttler baseline backed by Redis storage.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 60,
        },
      ],
      storage: new RedisThrottlerStorage() as any,
    }),
    ProxyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
