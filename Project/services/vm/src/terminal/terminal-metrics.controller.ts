import {
  Controller,
  ForbiddenException,
  Get,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TerminalTelemetryService } from "./terminal-telemetry.service";

@Controller("terminal")
@UseGuards(JwtAuthGuard)
export class TerminalMetricsController {
  constructor(private readonly telemetry: TerminalTelemetryService) {}

  @Get("metrics")
  getMetrics(@CurrentUser() user: { userId: string; role: string }) {
    if (user.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can access terminal metrics");
    }

    return this.telemetry.getSnapshot();
  }
}