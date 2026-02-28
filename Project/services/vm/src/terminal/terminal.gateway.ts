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

interface SshSession {
  sshClient: Client;
  stream: ClientChannel;
}

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/terminal",
})
export class TerminalGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private readonly sessions = new Map<string, SshSession>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.cleanupSession(client.id);
  }

  @SubscribeMessage("connect-ssh")
  async handleConnectSsh(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { vmId: string; password: string },
  ) {
    try {
      // Verify JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        client.emit("error", { message: "Authentication required" });
        client.disconnect();
        return;
      }

      let user: { sub: string; email: string; role: string };
      try {
        user = this.jwtService.verify(token);
      } catch {
        client.emit("error", { message: "Invalid or expired token" });
        client.disconnect();
        return;
      }

      // Fetch VM from database
      const vm = await this.prisma.virtualMachine.findUnique({
        where: { id: payload.vmId },
      });

      if (!vm) {
        client.emit("error", { message: "Virtual machine not found" });
        return;
      }

      // Verify ownership or admin
      if (user.role !== "ADMIN" && vm.userId !== user.sub) {
        client.emit("error", { message: "Access denied" });
        return;
      }

      // Check VM is running
      if (vm.status !== "RUNNING") {
        client.emit("error", {
          message: `VM is not running (current status: ${vm.status})`,
        });
        return;
      }

      if (!vm.sshHost) {
        client.emit("error", { message: "VM SSH host not configured" });
        return;
      }

      // Create SSH connection
      const sshClient = new Client();

      sshClient.on("ready", () => {
        this.logger.log(
          `SSH connection ready for VM ${vm.id} (${vm.sshHost}:${vm.sshPort})`,
        );

        sshClient.shell(
          { term: "xterm-256color", cols: 80, rows: 24 },
          (err, stream) => {
            if (err) {
              this.logger.error("Failed to open SSH shell", err);
              client.emit("error", { message: "Failed to open SSH shell" });
              sshClient.end();
              return;
            }

            // Store session
            this.sessions.set(client.id, { sshClient, stream });

            client.emit("connected", {
              message: `Connected to ${vm.name}`,
            });

            // Pipe SSH output to socket
            stream.on("data", (data: Buffer) => {
              client.emit("output", data.toString("utf-8"));
            });

            stream.stderr.on("data", (data: Buffer) => {
              client.emit("output", data.toString("utf-8"));
            });

            stream.on("close", () => {
              this.logger.log(`SSH stream closed for VM ${vm.id}`);
              client.emit("disconnected", { message: "SSH session closed" });
              this.cleanupSession(client.id);
            });
          },
        );
      });

      sshClient.on("error", (err) => {
        this.logger.error(`SSH connection error for VM ${vm.id}`, err.message);
        client.emit("error", {
          message: `SSH connection failed: ${err.message}`,
        });
        this.cleanupSession(client.id);
      });

      sshClient.on("close", () => {
        this.logger.log(`SSH connection closed for VM ${vm.id}`);
        this.cleanupSession(client.id);
      });

      // Connect via password auth
      sshClient.connect({
        host: vm.sshHost,
        port: vm.sshPort ?? 22,
        username: vm.sshUsername ?? "root",
        password: payload.password,
        readyTimeout: 10000,
        keepaliveInterval: 30000,
      });
    } catch (error) {
      this.logger.error("Error in connect-ssh handler", error);
      client.emit("error", { message: "Internal server error" });
    }
  }

  @SubscribeMessage("input")
  handleInput(@ConnectedSocket() client: Socket, @MessageBody() data: string) {
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      session.stream.write(data);
    }
  }

  @SubscribeMessage("resize")
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { cols: number; rows: number },
  ) {
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      session.stream.setWindow(payload.rows, payload.cols, 0, 0);
    }
  }

  private cleanupSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      try {
        session.stream?.close();
      } catch {
        // ignore
      }
      try {
        session.sshClient?.end();
      } catch {
        // ignore
      }
      this.sessions.delete(clientId);
    }
  }
}
