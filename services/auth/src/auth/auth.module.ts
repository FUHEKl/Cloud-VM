import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { SecurityLoggerService } from "../common/security/security-logger.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "",
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN || "15m",
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SecurityLoggerService],
  exports: [AuthService],
})
export class AuthModule {}
