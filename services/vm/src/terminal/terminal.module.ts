import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TerminalGateway } from "./terminal.gateway";
import { TerminalTelemetryService } from "./terminal-telemetry.service";
import { TerminalMetricsController } from "./terminal-metrics.controller";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
    }),
  ],
  controllers: [TerminalMetricsController],
  providers: [TerminalGateway, TerminalTelemetryService],
})
export class TerminalModule {}
