import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtStrategy } from "./common/strategies/jwt.strategy";
import { AiModule } from "./ai/ai.module";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "",
      signOptions: { expiresIn: "15m" },
    }),
    AiModule,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}
