import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import * as net from "net";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";

interface VncDataMessage {
  data: string; // base64-encoded binary data
}

@WebSocketGateway({
  namespace: "/vnc",
  path: "/vnc/socket.io",
  cors: {
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  },
})
export class VncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(VncGateway.name);
  private vncSockets = new Map<string, net.Socket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const vmId = client.handshake.query.vmId as string;
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers?.authorization as string | undefined)?.replace(
          "Bearer ",
          "",
        );

      if (!vmId || !token) {
        this.logger.warn(`VNC connection attempt without vmId or token`);
        client.emit("vnc:error", "Missing vmId or token");
        client.disconnect();
        return;
      }

      // Validate JWT
      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (err) {
        this.logger.warn(`VNC JWT verification failed: ${err}`);
        client.emit("vnc:error", "Invalid token");
        client.disconnect();
        return;
      }

      if (!payload || !payload.sub) {
        this.logger.warn(`VNC JWT payload missing sub claim`);
        client.emit("vnc:error", "Invalid token");
        client.disconnect();
        return;
      }

      // Get VM from DB — must belong to authenticated user and be RUNNING
      const vm = await this.prisma.virtualMachine.findFirst({
        where: {
          id: vmId,
          userId: payload.sub,
        },
      });

      if (!vm) {
        this.logger.warn(`VNC: VM ${vmId} not found or unauthorized for user ${payload.sub}`);
        client.emit("vnc:error", "VM not found");
        client.disconnect();
        return;
      }

      if (vm.status !== "RUNNING") {
        this.logger.warn(
          `VNC: VM ${vmId} not RUNNING (status=${vm.status})`,
        );
        client.emit("vnc:error", "VM is not running");
        client.disconnect();
        return;
      }

      if (!vm.ipAddress) {
        this.logger.warn(`VNC: VM ${vmId} has no IP address`);
        client.emit("vnc:error", "VM IP address not available");
        client.disconnect();
        return;
      }

      // Connect to VNC server on port 5901 (VNC port)
      const vncSocket = net.createConnection({
        host: vm.ipAddress,
        port: 5901,
      });

      vncSocket.on("connect", () => {
        this.logger.log(`VNC: Connected to ${vm.ipAddress}:5901 for VM ${vmId}`);
        client.emit("vnc:ready");
      });

      vncSocket.on("data", (data: Buffer) => {
        // Send binary data to client as base64
        client.emit("vnc:data", data.toString("base64"));
      });

      vncSocket.on("error", (err: Error) => {
        this.logger.error(
          `VNC socket error for VM ${vmId}: ${err.message}`,
        );
        client.emit("vnc:error", `VNC connection error: ${err.message}`);
        client.disconnect();
      });

      vncSocket.on("close", () => {
        this.logger.log(`VNC socket closed for VM ${vmId}`);
        client.emit("vnc:close");
        client.disconnect();
      });

      this.vncSockets.set(client.id, vncSocket);
      this.logger.log(`VNC: Client connected to VM ${vmId}`);
    } catch (err) {
      this.logger.error(`VNC connection error: ${err}`);
      client.emit("vnc:error", "Connection failed");
      client.disconnect();
    }
  }

  @SubscribeMessage("vnc:data")
  handleVncData(
    @MessageBody() message: VncDataMessage,
    @ConnectedSocket() client: Socket,
  ) {
    const vncSocket = this.vncSockets.get(client.id);
    if (vncSocket && !vncSocket.destroyed) {
      try {
        // Decode base64 and send to VNC server
        const buffer = Buffer.from(message.data, "base64");
        vncSocket.write(buffer);
      } catch (err) {
        this.logger.error(`Error forwarding VNC data: ${err}`);
      }
    }
  }

  handleDisconnect(client: Socket) {
    const vncSocket = this.vncSockets.get(client.id);
    if (vncSocket) {
      vncSocket.destroy();
      this.vncSockets.delete(client.id);
      this.logger.log(`VNC: Client disconnected, socket cleaned up`);
    }
  }
}
