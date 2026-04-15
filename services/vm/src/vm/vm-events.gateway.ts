import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger, OnModuleInit } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { NatsService } from "../nats/nats.service";
import { createHash } from "crypto";

interface VmStatusPayload {
  vmId: string;
  status: string;
  userId?: string;
  ipAddress?: string;
  oneVmId?: number;
  sshHost?: string;
  sshPort?: number;
  error?: string;
  action?: string;
}

interface VmSshReadyPayload {
  vmId: string;
  userId?: string;
  privateKey?: string;
  generatedSshPrivateKey?: string;
  sshPrivateKey?: string;
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

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: "/vm-events",
  path: "/vm-events/socket.io",
})
export class VmEventsGateway
  implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VmEventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async onModuleInit() {
    // Subscribe to VM status updates from NATS and broadcast via WebSocket
    this.nats.subscribe(
      "vm.status.update",
      async (data: Record<string, unknown>) => {
        await this.broadcastVmStatus(data as unknown as VmStatusPayload);
      },
    );

    this.nats.subscribe(
      "vm.ssh.ready",
      async (data: Record<string, unknown>) => {
        await this.broadcastVmSshReady(data as unknown as VmSshReadyPayload);
      },
    );

    this.logger.log("Listening for VM status updates via NATS → WebSocket");
    this.logger.log("Listening for VM SSH key updates via NATS → WebSocket");
  }

  handleConnection(client: Socket) {
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
            namespace: "vm-events",
            result: "denied",
            reason: "missing_token",
          }),
        );
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        sub: string;
        email: string;
        role: string;
        fp?: string;
      };

      // SECURITY: enforce fingerprint binding for websocket VM event sessions.
      if (!payload.fp || payload.fp !== buildSocketFingerprint(client)) {
        throw new Error("Token fingerprint mismatch");
      }

      // Join user-specific room so they only receive their own VM updates
      client.join(`user:${payload.sub}`);
      client.data.userId = payload.sub;
      client.data.role = payload.role;

      // Admins also join the admin room (receive all VM updates)
      if (payload.role === "ADMIN") {
        client.join("admin");
      }

      this.logger.log(
        `Client connected: ${client.id} (user: ${payload.sub})`,
      );
    } catch {
      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          eventType: "websocket.auth.failure",
          socketId: client.id,
          namespace: "vm-events",
          result: "denied",
          reason: "invalid_token",
        }),
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Look up the VM owner and broadcast the status update
   * to the correct user room (and admin room).
   */
  private async broadcastVmStatus(data: VmStatusPayload) {
    try {
      if (data.userId) {
        this.server.to(`user:${data.userId}`).emit("vm:status", data);
        this.server.to("admin").emit("vm:status", data);
        this.logger.log(
          `Broadcasted VM ${data.vmId} status=${data.status} via payload userId=${data.userId}`,
        );
        return;
      }

      const vm = await this.prisma.virtualMachine.findUnique({
        where: { id: data.vmId },
        select: { userId: true, name: true },
      });

      if (!vm) return;

      const payload = { ...data, vmName: vm.name };

      // Emit to the VM owner
      this.server.to(`user:${vm.userId}`).emit("vm:status", payload);

      // Also emit to admin room
      this.server.to("admin").emit("vm:status", payload);

      this.logger.log(
        `Broadcasted VM ${data.vmId} status=${data.status} to user=${vm.userId}`,
      );
    } catch (error) {
      this.logger.error(`Error broadcasting VM status: ${error}`);
    }
  }

  /**
   * Forward generated VM SSH private key events to the VM owner.
   */
  private async broadcastVmSshReady(data: VmSshReadyPayload) {
    try {
      const privateKey =
        data.privateKey ?? data.generatedSshPrivateKey ?? data.sshPrivateKey;

      if (!data.vmId || !privateKey) {
        this.logger.warn(
          `Ignoring vm.ssh.ready event with missing vmId/privateKey (vmId=${data.vmId ?? "unknown"})`,
        );
        return;
      }

      if (data.userId) {
        this.server.to(`user:${data.userId}`).emit("vm:ssh-key", {
          vmId: data.vmId,
          privateKey,
        });
        this.logger.log(
          `Broadcasted vm:ssh-key for VM ${data.vmId} to user=${data.userId}`,
        );
        return;
      }

      const vm = await this.prisma.virtualMachine.findUnique({
        where: { id: data.vmId },
        select: { userId: true },
      });

      if (!vm) {
        this.logger.warn(
          `Ignoring vm.ssh.ready event for unknown VM ${data.vmId}`,
        );
        return;
      }

      this.server.to(`user:${vm.userId}`).emit("vm:ssh-key", {
        vmId: data.vmId,
        privateKey,
      });

      this.logger.log(
        `Broadcasted vm:ssh-key for VM ${data.vmId} to user=${vm.userId}`,
      );
    } catch (error) {
      this.logger.error(`Error broadcasting VM SSH key: ${error}`);
    }
  }
}
