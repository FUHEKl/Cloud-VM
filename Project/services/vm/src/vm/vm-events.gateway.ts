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

interface VmStatusPayload {
  vmId: string;
  status: string;
  ipAddress?: string;
  oneVmId?: number;
  sshHost?: string;
  sshPort?: number;
  error?: string;
  action?: string;
}

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/vm-events",
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
    this.logger.log("Listening for VM status updates via NATS → WebSocket");
  }

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        sub: string;
        email: string;
        role: string;
      };

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
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
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
}
