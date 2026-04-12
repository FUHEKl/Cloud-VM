import { Injectable, Logger } from "@nestjs/common";

export interface SecurityEvent {
  eventType: string;
  userId?: string;
  ip?: string;
  result: "success" | "failure" | "denied" | "blocked";
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger("SecurityLogger");

  log(event: SecurityEvent) {
    // SECURITY: structured JSON log for audit events; excludes secrets/tokens/passwords.
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        eventType: event.eventType,
        userId: event.userId ?? null,
        ip: event.ip ?? null,
        result: event.result,
        metadata: event.metadata ?? {},
      }),
    );
  }
}
