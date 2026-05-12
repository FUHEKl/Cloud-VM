import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { VncGateway } from "./vnc.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
    }),
    PrismaModule,
  ],
  providers: [VncGateway],
})
export class VncModule {}
