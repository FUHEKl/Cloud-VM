import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { Client, ClientChannel } from "ssh2";
import { TerminalTelemetryService } from "./terminal-telemetry.service";
import { createHash } from "crypto";

interface SshSession {
  sshClient: Client;
  stream: ClientChannel;
  bastionClient?: Client;
}

interface BastionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

function extractCookieValue(rawCookie: string | undefined, cookieName: string): string | undefined {
  if (!rawCookie) return undefined;
  const parts = rawCookie.split(";");
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return undefined;
}

function buildSocketFingerprint(client: Socket): string {
  const ip =
    (typeof client.handshake.headers["x-forwarded-for"] === "string"
      ? client.handshake.headers["x-forwarded-for"].split(",")[0].trim()
      : client.handshake.address || "unknown"
    ).replace("::ffff:", "");
  const userAgent =
    (typeof client.handshake.headers["user-agent"] === "string"
      ? client.handshake.headers["user-agent"]
      : "unknown"
    ).trim();

  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

const terminalCorsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: terminalCorsOrigins,
    credentials: true,
  },
  namespace: "/terminal",
  path: "/terminal/socket.io",
})
export class TerminalGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private readonly sessions = new Map<string, SshSession>();
  private readonly inputWindowStats = new Map<
    string,
    { windowStartMs: number; bytesInWindow: number }
  >();
  private readonly maxInputBytesPerEvent = 4096;
  private readonly maxInputBytesPerSecond = 32768;
  private readonly maxInputEventsPerSecond = 100;
  private readonly allowPasswordFallback = (() => {
    const configured = (process.env.TERMINAL_ALLOW_PASSWORD_FALLBACK || "").trim().toLowerCase();
    if (configured === "true") return true;
    if (configured === "false") return false;
    return (process.env.NODE_ENV || "development").toLowerCase() !== "production";
  })();
  private readonly sshConnectTimeoutMs = Math.max(
    5000,
    Number(process.env.TERMINAL_SSH_CONNECT_TIMEOUT_MS ?? 20000),
  );
  private readonly inputEventWindowStats = new Map<
    string,
    { windowStartMs: number; eventsInWindow: number }
  >();
  private readonly dangerousInputViolations = new Map<string, number>();
  private readonly dangerousInputPatterns: RegExp[] = [
    /rm\s+-rf\s+\/$/i,
    /dd\s+if=\/dev\/zero/i,
    /:\(\)\s*\{\s*:\|:&\s*\};:/,
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly telemetry: TerminalTelemetryService,
  ) {
    if (!process.env.JWT_SECRET) {
      this.logger.error("JWT_SECRET is required for terminal authentication");
      throw new Error("JWT_SECRET is required");
    }
  }

  private getBastionConfig(): BastionConfig | null {
    let host = (process.env.TERMINAL_SSH_BASTION_HOST || "").trim();
    if (!host) {
      const xmlrpc = (process.env.ONE_XMLRPC || "").trim();
      if (xmlrpc) {
        try {
          host = new URL(xmlrpc).hostname;
        } catch {
          // ignore parse issues
        }
      }
    }

    const username =
      (process.env.TERMINAL_SSH_BASTION_USERNAME || process.env.ONE_USERNAME || "").trim();
    const password =
      (process.env.TERMINAL_SSH_BASTION_PASSWORD || process.env.ONE_PASSWORD || "").trim();
    const privateKey = (process.env.TERMINAL_SSH_BASTION_PRIVATE_KEY || "")
      .replace(/\\n/g, "\n")
      .trim();
    const port = Number(process.env.TERMINAL_SSH_BASTION_PORT || 22);

    if (!host || !username || (!password && !privateKey)) {
      return null;
    }

    return {
      host,
      port: Number.isFinite(port) && port > 0 ? port : 22,
      username,
      password: password || undefined,
      privateKey: privateKey || undefined,
    };
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.telemetry.markDisconnect(client.id, "socket_disconnected");
    this.cleanupSession(client.id);
  }

  @SubscribeMessage("connect-ssh")
  async handleConnectSsh(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { vmId: string; password?: string; username?: string; privateKey?: string },
  ) {
    try {
      if (!payload?.vmId || typeof payload.vmId !== "string") {
        this.telemetry.markConnectDenied(client.id, "invalid_vm_identifier");
        client.emit("error", { message: "Invalid VM identifier" });
        return;
      }

      if (payload.password && payload.password.length > 256) {
        this.telemetry.markConnectDenied(client.id, "password_too_long", payload.vmId);
        client.emit("error", { message: "Password is too long" });
        return;
      }

      if (payload.privateKey && payload.privateKey.length > 32768) {
        this.telemetry.markConnectDenied(client.id, "private_key_too_large", payload.vmId);
        client.emit("error", { message: "Private key is too large" });
        return;
      }

      this.cleanupSession(client.id);

      // Verify JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "") ||
        extractCookieValue(client.handshake.headers?.cookie, "accessToken");

      if (!token) {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            eventType: "websocket.auth.failure",
            socketId: client.id,
            namespace: "terminal",
            result: "denied",
            reason: "missing_token",
          }),
        );
        this.telemetry.markConnectDenied(client.id, "missing_token", payload.vmId);
        client.emit("error", { message: "Authentication required" });
        client.disconnect();
        return;
      }

      let user: { sub: string; email: string; role: string; fp?: string };
      try {
        user = this.jwtService.verify(token);
        // SECURITY: enforce fingerprint binding for websocket terminal sessions.
        if (!user.fp || user.fp !== buildSocketFingerprint(client)) {
          throw new Error("Token fingerprint mismatch");
        }
      } catch {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            eventType: "websocket.auth.failure",
            socketId: client.id,
            namespace: "terminal",
            result: "denied",
            reason: "invalid_token_or_fingerprint",
          }),
        );
        this.telemetry.markConnectDenied(client.id, "invalid_token", payload.vmId);
        client.emit("error", { message: "Invalid or expired token" });
        client.disconnect();
        return;
      }

      this.telemetry.markConnectAttempt(client.id, payload.vmId, user.sub);

      const vm = await this.prisma.virtualMachine.findUnique({
        where: { id: payload.vmId },
      });

      if (!vm) {
        this.telemetry.markConnectDenied(client.id, "vm_not_found", payload.vmId, user.sub);
        client.emit("error", { message: "Virtual machine not found" });
        return;
      }

      if (user.role !== "ADMIN" && vm.userId !== user.sub) {
        this.telemetry.markConnectDenied(client.id, "access_denied", payload.vmId, user.sub);
        client.emit("error", { message: "Access denied" });
        return;
      }

      if (vm.status !== "RUNNING") {
        this.telemetry.markConnectDenied(client.id, `vm_not_running:${vm.status}`, payload.vmId, user.sub);
        client.emit("error", {
          message: `VM is not running (current status: ${vm.status})`,
        });
        return;
      }

      if (!vm.sshHost) {
        this.telemetry.markConnectDenied(client.id, "ssh_host_missing", payload.vmId, user.sub);
        client.emit("error", { message: "VM SSH host not configured" });
        return;
      }

      const sshClient = new Client();
      let bastionClient: Client | undefined;
      let hasAttemptedBastionFallback = false;
      let hasAttemptedPasswordRetry = false;
      const bastionConfig = this.getBastionConfig();
      const username = payload.username ?? vm.sshUsername ?? "cloudvm";
      const defaultVmPassword = (process.env.TERMINAL_DEFAULT_VM_PASSWORD || "cloudvm123").trim();
      let connectTimeout: NodeJS.Timeout | null = null;

      const clearConnectTimeout = () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
      };

      const tryBastionFallback = (reason: string): boolean => {
        if (hasAttemptedBastionFallback || !bastionConfig) {
          return false;
        }
        hasAttemptedBastionFallback = true;

        this.logger.warn(
          `Direct SSH to ${vm.sshHost}:${vm.sshPort ?? 22} failed (${reason}); trying bastion ${bastionConfig.username}@${bastionConfig.host}:${bastionConfig.port}`,
        );

        try {
          sshClient.end();
        } catch {
          // ignore
        }

        bastionClient = new Client();
        const viaBastionClient = new Client();

        viaBastionClient.on("ready", () => {
          clearConnectTimeout();
          this.logger.log(
            `SSH ready via bastion for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) as ${username}`,
          );

          viaBastionClient.shell(
            { term: "xterm-256color", cols: 80, rows: 24 },
            (err, stream) => {
              if (err) {
                this.logger.error("Failed to open SSH shell (bastion)", err);
                this.telemetry.markConnectFailed(client.id, "ssh_shell_open_failed", vm.id, user.sub);
                client.emit("error", { message: "Failed to open SSH shell" });
                viaBastionClient.end();
                bastionClient?.end();
                return;
              }

              this.sessions.set(client.id, {
                sshClient: viaBastionClient,
                stream,
                bastionClient,
              });
              this.telemetry.markConnectSuccess(client.id, vm.id, user.sub);

              client.emit("connected", {
                message: `Connected to ${vm.name} (${vm.sshHost}) via bastion`,
              });

              stream.on("data", (data: Buffer) => {
                this.telemetry.addOutputBytes(client.id, data.byteLength);
                client.emit("output", data.toString("utf-8"));
              });

              stream.stderr.on("data", (data: Buffer) => {
                this.telemetry.addOutputBytes(client.id, data.byteLength);
                client.emit("output", data.toString("utf-8"));
              });

              stream.on("close", () => {
                this.logger.log(`SSH stream closed for VM ${vm.id} (bastion)`);
                this.telemetry.markDisconnect(client.id, "ssh_stream_closed");
                client.emit("disconnected", { message: "SSH session closed" });
                this.cleanupSession(client.id);
              });
            },
          );
        });

        viaBastionClient.on("error", (err) => {
          clearConnectTimeout();
          this.logger.error(`SSH error via bastion for VM ${vm.id} (${vm.sshHost})`, err.message);
          this.telemetry.markConnectFailed(client.id, `ssh_error:${err.message}`, vm.id, user.sub);
          client.emit("error", {
            message: `SSH via bastion failed: ${err.message}`,
          });
          this.cleanupSession(client.id);
        });

        viaBastionClient.on("close", () => {
          clearConnectTimeout();
          this.logger.log(`SSH connection closed for VM ${vm.id} (bastion)`);
          this.telemetry.markDisconnect(client.id, "ssh_connection_closed");
          this.cleanupSession(client.id);
        });

        bastionClient.on("ready", () => {
          bastionClient?.forwardOut(
            "127.0.0.1",
            0,
            vm.sshHost!,
            vm.sshPort ?? 22,
            (err, stream) => {
              if (err || !stream) {
                this.logger.error(
                  `Bastion forwardOut failed for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22})`,
                  err?.message,
                );
                client.emit("error", {
                  message: `Bastion tunnel failed to ${vm.sshHost}:${vm.sshPort ?? 22}`,
                });
                this.cleanupSession(client.id);
                return;
              }

              const tunneledConnectOptions: {
                sock: any;
                username: string;
                password?: string;
                privateKey?: string;
                readyTimeout: number;
                keepaliveInterval: number;
                keepaliveCountMax: number;
              } = {
                sock: stream,
                username,
                readyTimeout: 30000,
                keepaliveInterval: 30000,
                keepaliveCountMax: 5,
              };

              if (payload.privateKey && payload.privateKey.trim().length > 0) {
                tunneledConnectOptions.privateKey = payload.privateKey;
                if (this.allowPasswordFallback && username === "cloudvm" && defaultVmPassword) {
                  // Reliability fallback: when key auth fails due delayed/partial key setup,
                  // also allow password auth on the same attempt for the default cloudvm user.
                  tunneledConnectOptions.password = payload.password || defaultVmPassword;
                }
              } else if (payload.password) {
                tunneledConnectOptions.password = payload.password;
              }

              viaBastionClient.connect(tunneledConnectOptions);
            },
          );
        });

        bastionClient.on("error", (err) => {
          clearConnectTimeout();
          this.logger.error(`Bastion SSH error (${bastionConfig.host})`, err.message);
          client.emit("error", {
            message: `Bastion SSH connection failed: ${err.message}`,
          });
          this.cleanupSession(client.id);
        });

        connectTimeout = setTimeout(() => {
          this.logger.error(
            `Bastion SSH connect timeout for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) after ${this.sshConnectTimeoutMs}ms`,
          );
          this.telemetry.markConnectFailed(client.id, "ssh_connect_timeout_bastion", vm.id, user.sub);
          client.emit("error", {
            message: `Timed out reaching ${vm.sshHost}:${vm.sshPort ?? 22} via bastion ${bastionConfig.host}`,
          });
          this.cleanupSession(client.id);
        }, this.sshConnectTimeoutMs);

        const bastionConnectOptions: {
          host: string;
          port: number;
          username: string;
          password?: string;
          privateKey?: string;
          readyTimeout: number;
        } = {
          host: bastionConfig.host,
          port: bastionConfig.port,
          username: bastionConfig.username,
          readyTimeout: 15000,
        };

        if (bastionConfig.privateKey) {
          bastionConnectOptions.privateKey = bastionConfig.privateKey;
        } else if (bastionConfig.password) {
          bastionConnectOptions.password = bastionConfig.password;
        }

        bastionClient.connect(bastionConnectOptions);
        return true;
      };

      const tryPasswordOnlyRetry = (reason: string): boolean => {
        const candidatePassword = payload.password || defaultVmPassword;
        if (
          hasAttemptedPasswordRetry ||
          !this.allowPasswordFallback ||
          !payload.privateKey ||
          !candidatePassword ||
          username !== "cloudvm"
        ) {
          return false;
        }

        hasAttemptedPasswordRetry = true;
        this.logger.warn(
          `SSH key authentication failed (${reason}); retrying password-only for ${username}@${vm.sshHost}:${vm.sshPort ?? 22}`,
        );

        try {
          sshClient.end();
        } catch {
          // ignore
        }

        const retryClient = new Client();

        retryClient.on("ready", () => {
          clearConnectTimeout();
          this.logger.log(
            `SSH ready (password retry) for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) as ${username}`,
          );

          retryClient.shell(
            { term: "xterm-256color", cols: 80, rows: 24 },
            (err, stream) => {
              if (err) {
                this.logger.error("Failed to open SSH shell (password retry)", err);
                this.telemetry.markConnectFailed(client.id, "ssh_shell_open_failed", vm.id, user.sub);
                client.emit("error", { message: "Failed to open SSH shell" });
                retryClient.end();
                return;
              }

              this.sessions.set(client.id, { sshClient: retryClient, stream });
              this.telemetry.markConnectSuccess(client.id, vm.id, user.sub);

              client.emit("connected", {
                message: `Connected to ${vm.name} (${vm.sshHost})`,
              });

              stream.on("data", (data: Buffer) => {
                this.telemetry.addOutputBytes(client.id, data.byteLength);
                client.emit("output", data.toString("utf-8"));
              });

              stream.stderr.on("data", (data: Buffer) => {
                this.telemetry.addOutputBytes(client.id, data.byteLength);
                client.emit("output", data.toString("utf-8"));
              });

              stream.on("close", () => {
                this.logger.log(`SSH stream closed for VM ${vm.id}`);
                this.telemetry.markDisconnect(client.id, "ssh_stream_closed");
                client.emit("disconnected", { message: "SSH session closed" });
                this.cleanupSession(client.id);
              });
            },
          );
        });

        retryClient.on("error", (retryErr) => {
          clearConnectTimeout();
          this.logger.error(
            `SSH error after password retry for VM ${vm.id} (${vm.sshHost})`,
            retryErr.message,
          );
          this.telemetry.markConnectFailed(client.id, `ssh_error:${retryErr.message}`, vm.id, user.sub);
          client.emit("error", {
            message: `SSH authentication failed at ${vm.sshHost}. Password retry also failed.`,
          });
          this.cleanupSession(client.id);
        });

        retryClient.on("close", () => {
          clearConnectTimeout();
          this.logger.log(`SSH connection closed for VM ${vm.id} (password retry)`);
          this.telemetry.markDisconnect(client.id, "ssh_connection_closed");
          this.cleanupSession(client.id);
        });

        connectTimeout = setTimeout(() => {
          this.logger.error(
            `SSH password-retry timeout for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) after ${this.sshConnectTimeoutMs}ms`,
          );
          this.telemetry.markConnectFailed(client.id, "ssh_connect_timeout_password_retry", vm.id, user.sub);
          client.emit("error", {
            message: `Timed out reaching ${vm.sshHost}:${vm.sshPort ?? 22} during password retry.`,
          });
          this.cleanupSession(client.id);
        }, this.sshConnectTimeoutMs);

        retryClient.connect({
          host: vm.sshHost || undefined,
          port: vm.sshPort ?? 22,
          username,
          password: candidatePassword,
          readyTimeout: 30000,
          keepaliveInterval: 30000,
          keepaliveCountMax: 5,
        });

        return true;
      };

      sshClient.on("ready", () => {
        clearConnectTimeout();
        this.logger.log(
          `SSH ready for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) as ${username}`,
        );

        sshClient.shell(
          { term: "xterm-256color", cols: 80, rows: 24 },
          (err, stream) => {
            if (err) {
              this.logger.error("Failed to open SSH shell", err);
              this.telemetry.markConnectFailed(client.id, "ssh_shell_open_failed", vm.id, user.sub);
              client.emit("error", { message: "Failed to open SSH shell" });
              sshClient.end();
              return;
            }

            this.sessions.set(client.id, { sshClient, stream });
            this.telemetry.markConnectSuccess(client.id, vm.id, user.sub);

            // Emit "connected" with object shape — matches Terminal.tsx handler
            client.emit("connected", {
              message: `Connected to ${vm.name} (${vm.sshHost})`,
            });

            stream.on("data", (data: Buffer) => {
              this.telemetry.addOutputBytes(client.id, data.byteLength);
              client.emit("output", data.toString("utf-8"));
            });

            stream.stderr.on("data", (data: Buffer) => {
              this.telemetry.addOutputBytes(client.id, data.byteLength);
              client.emit("output", data.toString("utf-8"));
            });

            stream.on("close", () => {
              this.logger.log(`SSH stream closed for VM ${vm.id}`);
              this.telemetry.markDisconnect(client.id, "ssh_stream_closed");
              // Emit "disconnected" with object shape — matches Terminal.tsx handler
              client.emit("disconnected", { message: "SSH session closed" });
              this.cleanupSession(client.id);
            });
          },
        );
      });

      sshClient.on("error", (err) => {
        clearConnectTimeout();

        if (
          (err.message.includes("Authentication") || err.message.includes("auth")) &&
          tryPasswordOnlyRetry(err.message)
        ) {
          return;
        }

        if (
          (err.message.includes("ECONNREFUSED") ||
            err.message.includes("ETIMEDOUT") ||
            err.message.includes("Timed out")) &&
          tryBastionFallback(err.message)
        ) {
          return;
        }

        this.logger.error(`SSH error for VM ${vm.id} (${vm.sshHost})`, err.message);
        this.telemetry.markConnectFailed(client.id, `ssh_error:${err.message}`, vm.id, user.sub);

        // Give the user an actionable message based on the error type
        let userMessage: string;
        if (err.message.includes("ECONNREFUSED")) {
          userMessage = `SSH refused at ${vm.sshHost}:${vm.sshPort ?? 22}. The VM may still be booting — try again in a few seconds.`;
        } else if (err.message.includes("ETIMEDOUT") || err.message.includes("Timed out")) {
          userMessage = `SSH timed out connecting to ${vm.sshHost}. The VM may still be booting, or check that port 22 is reachable.`;
        } else if (err.message.includes("Authentication") || err.message.includes("auth")) {
          userMessage = `SSH authentication failed at ${vm.sshHost}. The SSH key may not have been injected into the VM yet — wait a moment and try again.`;
        } else {
          userMessage = `SSH error: ${err.message}`;
        }

        client.emit("error", { message: userMessage });
        this.cleanupSession(client.id);
      });

      sshClient.on("close", () => {
        clearConnectTimeout();
        this.logger.log(`SSH connection closed for VM ${vm.id}`);
        this.telemetry.markDisconnect(client.id, "ssh_connection_closed");
        this.cleanupSession(client.id);
      });

      const connectOptions: {
        host: string;
        port: number;
        username: string;
        password?: string;
        privateKey?: string;
        readyTimeout: number;
        keepaliveInterval: number;
        keepaliveCountMax: number;
      } = {
        host: vm.sshHost,
        port: vm.sshPort ?? 22,
        username,
        // 30 s gives slow VMs time to finish cloud-init before we give up.
        // 15 s was too short for freshly booted VMs.
        readyTimeout: 30000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 5,
      };

      this.logger.log(
        `SSH connecting: ${username}@${vm.sshHost}:${vm.sshPort ?? 22} ` +
        `auth=${payload.privateKey ? "privateKey" : "password"}`,
      );

      connectTimeout = setTimeout(() => {
        this.logger.error(
          `SSH connect timeout for VM ${vm.id} (${vm.sshHost}:${vm.sshPort ?? 22}) after ${this.sshConnectTimeoutMs}ms`,
        );

        if (tryBastionFallback("direct_connect_timeout")) {
          return;
        }

        this.telemetry.markConnectFailed(client.id, "ssh_connect_timeout", vm.id, user.sub);
        client.emit("error", {
          message:
            `Timed out reaching ${vm.sshHost}:${vm.sshPort ?? 22}. SSH key may be correct, but this usually means the VM network is not reachable from the VM service host.`,
        });
        this.cleanupSession(client.id);
      }, this.sshConnectTimeoutMs);

      if (payload.privateKey && payload.privateKey.trim().length > 0) {
        connectOptions.privateKey = payload.privateKey;
        if (this.allowPasswordFallback && username === "cloudvm" && defaultVmPassword) {
          // Reliability fallback for dev/lab templates that may race key injection.
          connectOptions.password = payload.password || defaultVmPassword;
        }
      } else if (payload.password) {
        connectOptions.password = payload.password;
      } else {
        // Neither credential was provided — tell the client explicitly
        this.telemetry.markConnectDenied(client.id, "no_credentials", payload.vmId, user.sub);
        client.emit("error", {
          message: "No SSH credentials provided. Supply a private key or password.",
        });
        return;
      }

      sshClient.connect(connectOptions);
    } catch (error) {
      this.logger.error("Error in connect-ssh handler", error);
      this.telemetry.markConnectFailed(client.id, "internal_error", payload?.vmId);
      client.emit("error", { message: "Internal server error" });
    }
  }

  @SubscribeMessage("input")
  handleInput(@ConnectedSocket() client: Socket, @MessageBody() data: string) {
    const session = this.sessions.get(client.id);
    if (!session?.stream) return;

    if (typeof data !== "string") {
      this.telemetry.markInputRejected(client.id, "invalid_terminal_input_type");
      client.emit("error", { message: "Invalid terminal input" });
      return;
    }

    const byteLength = Buffer.byteLength(data, "utf8");
    if (byteLength === 0) return;

    if (byteLength > this.maxInputBytesPerEvent) {
      this.telemetry.markInputRejected(client.id, "input_chunk_too_large");
      client.emit("error", { message: "Input chunk too large" });
      return;
    }

    if (!this.allowInputRate(client.id, byteLength)) {
      this.telemetry.markInputRejected(client.id, "input_rate_too_high");
      client.emit("error", { message: "Input rate too high" });
      return;
    }

    if (!this.allowInputEventRate(client.id)) {
      this.telemetry.markInputRejected(client.id, "input_event_rate_too_high");
      client.emit("error", { message: "Too many terminal input events" });
      this.logger.warn(`SECURITY: terminal event-rate exceeded for socket=${client.id}`);
      client.disconnect();
      return;
    }

    if (this.containsDangerousInput(data)) {
      const nextViolations = (this.dangerousInputViolations.get(client.id) || 0) + 1;
      this.dangerousInputViolations.set(client.id, nextViolations);
      this.logger.warn(
        `SECURITY: blocked dangerous terminal pattern socket=${client.id} violations=${nextViolations}`,
      );
      this.telemetry.markInputRejected(client.id, "dangerous_terminal_pattern_blocked");
      client.emit("error", {
        message:
          "Blocked potentially destructive command pattern. Repeated violations will disconnect this session.",
      });

      if (nextViolations >= 3) {
        client.disconnect();
      }
      return;
    }

    this.telemetry.addInputBytes(client.id, byteLength);
    session.stream.write(data);
  }

  @SubscribeMessage("resize")
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { cols: number; rows: number },
  ) {
    const session = this.sessions.get(client.id);
    if (!session?.stream || !payload) return;

    const cols = Number.isFinite(payload.cols)
      ? Math.max(20, Math.min(500, Math.floor(payload.cols)))
      : 80;
    const rows = Number.isFinite(payload.rows)
      ? Math.max(10, Math.min(200, Math.floor(payload.rows)))
      : 24;

    session.stream.setWindow(rows, cols, 0, 0);
  }

  private allowInputRate(clientId: string, incomingBytes: number): boolean {
    const now = Date.now();
    const current = this.inputWindowStats.get(clientId);

    if (!current || now - current.windowStartMs >= 1000) {
      this.inputWindowStats.set(clientId, {
        windowStartMs: now,
        bytesInWindow: incomingBytes,
      });
      return incomingBytes <= this.maxInputBytesPerSecond;
    }

    const nextBytes = current.bytesInWindow + incomingBytes;
    if (nextBytes > this.maxInputBytesPerSecond) {
      return false;
    }

    current.bytesInWindow = nextBytes;
    return true;
  }

  private allowInputEventRate(clientId: string): boolean {
    const now = Date.now();
    const current = this.inputEventWindowStats.get(clientId);

    if (!current || now - current.windowStartMs >= 1000) {
      this.inputEventWindowStats.set(clientId, {
        windowStartMs: now,
        eventsInWindow: 1,
      });
      return true;
    }

    current.eventsInWindow += 1;
    return current.eventsInWindow <= this.maxInputEventsPerSecond;
  }

  private containsDangerousInput(data: string): boolean {
    const normalized = data.trim().replace(/\s+/g, " ");
    return this.dangerousInputPatterns.some((pattern) => pattern.test(normalized));
  }

  private cleanupSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      try { session.stream?.close(); }   catch { /* ignore */ }
      try { session.sshClient?.end(); }  catch { /* ignore */ }
      try { session.bastionClient?.end(); } catch { /* ignore */ }
      this.sessions.delete(clientId);
    }
    this.inputWindowStats.delete(clientId);
    this.inputEventWindowStats.delete(clientId);
    this.dangerousInputViolations.delete(clientId);
  }
}
