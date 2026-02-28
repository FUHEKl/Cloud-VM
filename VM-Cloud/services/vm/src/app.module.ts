import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
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
      secret: process.env.JWT_SECRET || "super-secret-key",
      signOptions: { expiresIn: "15m" },
    }),
    NatsModule,
    VmModule,
    TerminalModule,
    PlanModule,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}
