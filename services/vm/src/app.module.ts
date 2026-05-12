import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "./prisma/prisma.module";
import { VmModule } from "./vm/vm.module";
import { TerminalModule } from "./terminal/terminal.module";
import { PlanModule } from "./plan/plan.module";
import { NatsModule } from "./nats/nats.module";
import { JwtStrategy } from "./common/strategies/jwt.strategy";
import { VncModule } from "./vnc/vnc.module";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
      signOptions: { expiresIn: "15m" },
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    NatsModule,
    VmModule,
    TerminalModule,
    VncModule,
    PlanModule,
  ],
  providers: [
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
