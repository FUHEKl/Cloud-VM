import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TerminalGateway } from "./terminal.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "super-secret-key",
    }),
  ],
  providers: [TerminalGateway],
})
export class TerminalModule {}
