import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { VncGateway } from "./vnc.gateway";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.JWT_SECRET ?? "" }),
  ],
  providers: [VncGateway],
})
export class VncModule {}
