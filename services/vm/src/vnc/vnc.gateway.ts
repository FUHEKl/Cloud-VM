import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { Client } from "ssh2";
import { createHash } from "crypto";
import { decryptVmPrivateKey } from "../vm/vm-ssh-key.crypto";

interface VncSession {
  sshClient: Client;
  stream: any;
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
  const ip = (client.conn?.remoteAddress || client.handshake.address || "unknown").replace(
    "::ffff:",
    "",
  );
  const userAgent =
    (typeof client.handshake.headers["user-agent"] === "string"
      ? client.handshake.headers["user-agent"]
      : "unknown"
    ).trim();

  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

const vncCorsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: vncCorsOrigins,
    credentials: true,
  },
  namespace: "/vnc",
  path: "/vnc/socket.io",
  transports: ["websocket"],
})
export class VncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VncGateway.name);
  private readonly sessions = new Map<string, VncSession>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    if (!process.env.JWT_SECRET) {
      this.logger.error("JWT_SECRET is required for VNC authentication");
      throw new Error("JWT_SECRET is required");
    }
  }

  async handleConnection(client: Socket) {
    try {
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
            namespace: "vnc",
            result: "denied",
            reason: "missing_token",
          }),
        );
        client.disconnect();
        return;
      }

      let user: { sub: string; email: string; role: string; fp?: string };
      try {
        user = this.jwtService.verify(token);
        if (!user.fp || user.fp !== buildSocketFingerprint(client)) {
          throw new Error("Token fingerprint mismatch");
        }
      } catch {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            eventType: "websocket.auth.failure",
            socketId: client.id,
            namespace: "vnc",
            result: "denied",
            reason: "invalid_token_or_fingerprint",
          }),
        );
        client.disconnect();
        return;
      }

      const vmId =
        (client.handshake.query?.vmId as string) ||
        (Array.isArray(client.handshake.query?.vmId)
          ? client.handshake.query?.vmId[0]
          : undefined);

      if (!vmId) {
        client.emit("vnc:error", "vmId query param required");
        client.disconnect();
        return;
      }

      const vm = await this.prisma.virtualMachine.findUnique({ where: { id: vmId } });
      if (!vm) {
        client.emit("vnc:error", "Virtual machine not found");
        client.disconnect();
        return;
      }

      if (user.role !== "ADMIN" && vm.userId !== user.sub) {
        client.emit("vnc:error", "Access denied");
        client.disconnect();
        return;
      }

      if (!vm.guiReady) {
        client.emit("vnc:error", "GUI not ready yet");
        client.disconnect();
        return;
      }

      if (vm.status !== "RUNNING") {
        client.emit("vnc:error", `VM is not running (status=${vm.status})`);
        client.disconnect();
        return;
      }

      if (!vm.sshHost) {
        client.emit("vnc:error", "VM SSH host not configured");
        client.disconnect();
        return;
      }

      if (!vm.vmPasswordEncrypted) {
        client.emit("vnc:error", "VM credentials not found");
        client.disconnect();
        return;
      }

      let password: string;
      try {
        password = decryptVmPrivateKey(vm.vmPasswordEncrypted);
      } catch {
        client.emit("vnc:error", "Failed to decrypt VM credentials");
        client.disconnect();
        return;
      }

      await this.openSshVncTunnel(client, vm.sshHost, vm.sshPort ?? 22, vm.sshUsername, password);
    } catch (error) {
      this.logger.error("VNC connection error", error as Error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.cleanupSession(client.id);
  }

  private openSshVncTunnel(
    client: Socket,
    host: string,
    port: number,
    username: string | null,
    password: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sshClient = new Client();
      const sshUsername = (username || "cloudvm").trim() || "cloudvm";

      sshClient.on("ready", () => {
        this.logger.log(`VNC SSH ready: ${sshUsername}@${host}:${port}`);
        sshClient.forwardOut("127.0.0.1", 0, "127.0.0.1", 5901, (err, stream) => {
          if (err || !stream) {
            client.emit("vnc:error", "Failed to open VNC tunnel");
            sshClient.end();
            reject(err || new Error("forwardOut failed"));
            return;
          }

          this.sessions.set(client.id, { sshClient, stream });

          stream.on("data", (chunk: Buffer) => {
            client.emit("vnc:data", chunk);
          });

          stream.on("close", () => {
            client.emit("vnc:close");
            this.cleanupSession(client.id);
            client.disconnect();
          });

          stream.on("error", (streamError: Error) => {
            client.emit("vnc:error", streamError.message);
            this.cleanupSession(client.id);
          });

          client.on("vnc:data", (data: Buffer | ArrayBuffer | ArrayBufferView | string) => {
            try {
              let buf: Buffer | null = null;

              if (Buffer.isBuffer(data)) {
                buf = data;
              } else if (data instanceof ArrayBuffer) {
                buf = Buffer.from(new Uint8Array(data));
              } else if (ArrayBuffer.isView(data)) {
                buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
              } else if (typeof data === "string") {
                buf = Buffer.from(data, "binary");
              }

              if (!buf) {
                this.logger.warn("VNC write error: unsupported payload type");
                return;
              }
              stream.write(buf);
            } catch (writeError) {
              this.logger.warn(`VNC write error: ${(writeError as Error).message}`);
            }
          });

          client.emit("vnc:ready");
          resolve();
        });
      });

      sshClient.on("error", (err) => {
        this.logger.error(`VNC SSH error: ${err.message}`);
        client.emit("vnc:error", "SSH connection failed");
        this.cleanupSession(client.id);
        reject(err);
      });

      sshClient.on("close", () => {
        this.cleanupSession(client.id);
      });

      sshClient.connect({
        host,
        port,
        username: sshUsername,
        password,
        readyTimeout: 20000,
        keepaliveInterval: 20000,
        keepaliveCountMax: 5,
      });
    });
  }

  private cleanupSession(socketId: string) {
    const session = this.sessions.get(socketId);
    if (session) {
      try { session.stream?.destroy(); } catch { /* ignore */ }
      try { session.sshClient?.end(); } catch { /* ignore */ }
      this.sessions.delete(socketId);
    }
  }
}
