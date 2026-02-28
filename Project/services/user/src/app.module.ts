import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "./prisma/prisma.module";
import { UserModule } from "./user/user.module";
import { SshKeyModule } from "./ssh-key/ssh-key.module";
import { JwtStrategy } from "./common/strategies/jwt.strategy";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "super-secret-key",
      signOptions: { expiresIn: "15m" },
    }),
    UserModule,
    SshKeyModule,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}
