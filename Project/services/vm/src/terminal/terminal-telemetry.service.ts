import { Injectable } from "@nestjs/common";

export interface TerminalAuditEvent {
  at: string;
  event:
    | "connect_attempt"
    | "connect_success"
    | "connect_denied"
    | "connect_failed"
    | "disconnect"
    | "input_rejected"
    | "input_accepted";
  clientId: string;
  vmId?: string;
  userId?: string;
  detail?: string;
}

interface TerminalClientStats {
  connectedAt: number;
  vmId?: string;
  userId?: string;
  inputBytes: number;
  outputBytes: number;
}

@Injectable()
export class TerminalTelemetryService {
  private readonly startedAt = Date.now();
  private readonly clients = new Map<string, TerminalClientStats>();
  private readonly audits: TerminalAuditEvent[] = [];
  private readonly maxAudits = 300;

  private totalConnections = 0;
  private failedConnections = 0;
  private rejectedInputs = 0;
  private totalInputBytes = 0;
  private totalOutputBytes = 0;

  recordAudit(event: TerminalAuditEvent) {
    this.audits.push(event);
    if (this.audits.length > this.maxAudits) {
      this.audits.splice(0, this.audits.length - this.maxAudits);
    }
  }

  markConnectAttempt(clientId: string, vmId?: string, userId?: string) {
    this.recordAudit({
      at: new Date().toISOString(),
      event: "connect_attempt",
      clientId,
      vmId,
      userId,
    });
  }

  markConnectSuccess(clientId: string, vmId?: string, userId?: string) {
    this.totalConnections += 1;
    this.clients.set(clientId, {
      connectedAt: Date.now(),
      vmId,
      userId,
      inputBytes: 0,
      outputBytes: 0,
    });

    this.recordAudit({
      at: new Date().toISOString(),
      event: "connect_success",
      clientId,
      vmId,
      userId,
    });
  }

  markConnectDenied(
    clientId: string,
    detail: string,
    vmId?: string,
    userId?: string,
  ) {
    this.failedConnections += 1;
    this.recordAudit({
      at: new Date().toISOString(),
      event: "connect_denied",
      clientId,
      vmId,
      userId,
      detail,
    });
  }

  markConnectFailed(
    clientId: string,
    detail: string,
    vmId?: string,
    userId?: string,
  ) {
    this.failedConnections += 1;
    this.recordAudit({
      at: new Date().toISOString(),
      event: "connect_failed",
      clientId,
      vmId,
      userId,
      detail,
    });
  }

  markDisconnect(clientId: string, detail?: string) {
    const existing = this.clients.get(clientId);

    this.recordAudit({
      at: new Date().toISOString(),
      event: "disconnect",
      clientId,
      vmId: existing?.vmId,
      userId: existing?.userId,
      detail,
    });

    this.clients.delete(clientId);
  }

  addInputBytes(clientId: string, bytes: number) {
    const existing = this.clients.get(clientId);
    if (existing) existing.inputBytes += bytes;
    this.totalInputBytes += bytes;

    this.recordAudit({
      at: new Date().toISOString(),
      event: "input_accepted",
      clientId,
      vmId: existing?.vmId,
      userId: existing?.userId,
      detail: `${bytes} bytes`,
    });
  }

  addOutputBytes(clientId: string, bytes: number) {
    const existing = this.clients.get(clientId);
    if (existing) existing.outputBytes += bytes;
    this.totalOutputBytes += bytes;
  }

  markInputRejected(clientId: string, detail: string) {
    this.rejectedInputs += 1;
    const existing = this.clients.get(clientId);
    this.recordAudit({
      at: new Date().toISOString(),
      event: "input_rejected",
      clientId,
      vmId: existing?.vmId,
      userId: existing?.userId,
      detail,
    });
  }

  getSnapshot() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      activeSessions: this.clients.size,
      totalConnections: this.totalConnections,
      failedConnections: this.failedConnections,
      rejectedInputs: this.rejectedInputs,
      totalInputBytes: this.totalInputBytes,
      totalOutputBytes: this.totalOutputBytes,
      activeClients: Array.from(this.clients.entries()).map(([clientId, s]) => ({
        clientId,
        vmId: s.vmId,
        userId: s.userId,
        connectedForSeconds: Math.floor((Date.now() - s.connectedAt) / 1000),
        inputBytes: s.inputBytes,
        outputBytes: s.outputBytes,
      })),
      recentAuditEvents: this.audits.slice(-100),
    };
  }
}