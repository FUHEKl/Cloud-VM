import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { VmModule } from "./vm/vm.module";
import { TerminalModule } from "./terminal/terminal.module";
import { PlanModule } from "./plan/plan.module";
import { NatsModule } from "./nats/nats.module";
import { JwtStrategy } from "./common/strategies/jwt.strategy";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
      signOptions: { expiresIn: "15m" },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    NatsModule,
    VmModule,
    TerminalModule,
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
