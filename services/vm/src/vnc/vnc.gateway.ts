import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { Client } from "ssh2";
import { Server, Socket } from "socket.io";
import * as net from "net";

interface VncSession {
  send: (data: Buffer | Uint8Array | ArrayBuffer) => void;
  cleanup: () => void;
}

function extractCookieValue(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;

  for (const part of raw.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return undefined;
}

function normalizeBinaryPayload(data: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}

const vncCorsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: { origin: vncCorsOrigins, credentials: true },
  namespace: "/vnc",
  path: "/vnc/socket.io",
})
export class VncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(VncGateway.name);
  private readonly sessions = new Map<string, VncSession>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      await this.initSession(client);
    } catch (error) {
      this.logger.error("VNC handleConnection error", error);
      client.emit("vnc:error", "Internal server error");
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`VNC client disconnected: ${client.id}`);
    this.cleanupSession(client.id);
  }

  @SubscribeMessage("vnc:data")
  handleData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Buffer | Uint8Array | ArrayBuffer,
  ) {
    const session = this.sessions.get(client.id);
    if (!session) {
      client.emit("vnc:error", "No active VNC session");
      return;
    }

    try {
      session.send(data);
    } catch (error) {
      this.logger.error(`VNC relay write failed for client ${client.id}`, error);
      client.emit("vnc:error", "Failed to forward VNC data");
      this.cleanupSession(client.id);
      client.disconnect();
    }
  }

  private async initSession(client: Socket): Promise<void> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace("Bearer ", "") ||
      extractCookieValue(client.handshake.headers?.cookie, "accessToken");

    if (!token) {
      client.emit("vnc:error", "Authentication required");
      client.disconnect();
      return;
    }

    let user: { sub: string; role: string };
    try {
      user = this.jwtService.verify(token);
    } catch {
      client.emit("vnc:error", "Invalid or expired session — please refresh");
      client.disconnect();
      return;
    }

    const vmId = typeof client.handshake.query?.vmId === "string"
      ? client.handshake.query.vmId
      : null;

    if (!vmId) {
      client.emit("vnc:error", "vmId is required");
      client.disconnect();
      return;
    }

    const vm = await this.prisma.virtualMachine.findUnique({ where: { id: vmId } });

    if (!vm) {
      client.emit("vnc:error", "VM not found");
      client.disconnect();
      return;
    }

    if (user.role !== "ADMIN" && vm.userId !== user.sub) {
      client.emit("vnc:error", "Access denied");
      client.disconnect();
      return;
    }

    if (vm.status !== "RUNNING") {
      client.emit("vnc:error", `VM is not running (status: ${vm.status})`);
      client.disconnect();
      return;
    }

    if (!vm.sshHost) {
      client.emit("vnc:error", "VM has no IP address yet — try again in a few seconds");
      client.disconnect();
      return;
    }

    const bastionHost = (
      process.env.TERMINAL_SSH_BASTION_HOST ||
      (() => {
        try {
          return new URL(process.env.ONE_XMLRPC || "").hostname;
        } catch {
          return "";
        }
      })()
    ).trim();

    if (bastionHost) {
      await this.connectViaBastionTunnel(
        client,
        { id: vm.id, sshHost: vm.sshHost! },
        bastionHost,
      );
      return;
    }

    await this.connectDirect(client, { id: vm.id, sshHost: vm.sshHost! });
  }

  private connectDirect(client: Socket, vm: { id: string; sshHost: string }): Promise<void> {
    return new Promise((resolve) => {
      const vncPort = 5901;
      this.logger.log(`VNC direct TCP ${vm.sshHost}:${vncPort} for VM ${vm.id}`);

      const tcp = net.createConnection({ host: vm.sshHost, port: vncPort });
      let settled = false;

      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      tcp.on("connect", () => {
        this.logger.log(`VNC TCP connected to ${vm.sshHost}:${vncPort}`);
        this.registerTcpSession(client, tcp);
        client.emit("vnc:ready");
        done();
      });

      tcp.on("error", (error: Error) => {
        this.logger.error(`VNC TCP error for VM ${vm.id}: ${error.message}`);
        client.emit("vnc:error", `Cannot reach VNC on VM: ${error.message}`);
        client.disconnect();
        done();
      });

      tcp.on("close", () => {
        client.emit("vnc:close", "VNC session ended");
        this.cleanupSession(client.id);
        done();
      });
    });
  }

  private connectViaBastionTunnel(
    client: Socket,
    vm: { id: string; sshHost: string },
    bastionHost: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      const vncPort = 5901;
      const bastionPort = Number(process.env.TERMINAL_SSH_BASTION_PORT || 22);
      const bastionUser = (
        process.env.TERMINAL_SSH_BASTION_USERNAME || process.env.ONE_USERNAME || ""
      ).trim();
      const bastionPass = (
        process.env.TERMINAL_SSH_BASTION_PASSWORD || process.env.ONE_PASSWORD || ""
      ).trim();
      const rawKey = (process.env.TERMINAL_SSH_BASTION_PRIVATE_KEY || "").replace(/\\n/g, "\n");

      if (!bastionUser || (!bastionPass && !rawKey)) {
        this.logger.warn("Bastion credentials not configured — falling back to direct TCP");
        void this.connectDirect(client, vm);
        resolve();
        return;
      }

      this.logger.log(
        `VNC bastion tunnel ${bastionUser}@${bastionHost}:${bastionPort} → ${vm.sshHost}:${vncPort}`,
      );

      const ssh = new Client();
      let settled = false;

      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        client.emit("vnc:error", "VNC tunnel connection timed out");
        ssh.end();
        client.disconnect();
        done();
      }, 20000);

      ssh.on("ready", () => {
        ssh.forwardOut("127.0.0.1", 0, vm.sshHost, vncPort, (err, stream) => {
          clearTimeout(timeout);

          if (err) {
            this.logger.error(`VNC forwardOut failed: ${err.message}`);
            client.emit("vnc:error", `VNC tunnel failed: ${err.message}`);
            ssh.end();
            client.disconnect();
            done();
            return;
          }

          const session: VncSession = {
            send: (data) => {
              const buf = normalizeBinaryPayload(data);
              if (!stream.destroyed) {
                try {
                  stream.write(buf);
                } catch {
                  // ignore closed stream writes
                }
              }
            },
            cleanup: () => {
              try {
                stream.end();
              } catch {
                // ignore
              }
              try {
                ssh.end();
              } catch {
                // ignore
              }
            },
          };

          this.sessions.set(client.id, session);

          stream.on("data", (data: Buffer) => client.emit("vnc:data", data));
          stream.stderr?.on("data", () => {
            // ignore stderr
          });

          stream.on("close", () => {
            client.emit("vnc:close", "VNC session ended");
            this.cleanupSession(client.id);
          });

          stream.on("error", (streamErr: Error) => {
            client.emit("vnc:error", `VNC stream error: ${streamErr.message}`);
            this.cleanupSession(client.id);
          });

          client.emit("vnc:ready");
          this.logger.log(`VNC tunnel ready for VM ${vm.id}`);
          done();
        });
      });

      ssh.on("error", (error: Error) => {
        clearTimeout(timeout);
        this.logger.error(`VNC bastion SSH error: ${error.message}`);
        client.emit("vnc:error", `Bastion SSH failed: ${error.message}`);
        client.disconnect();
        done();
      });

      ssh.on("close", () => {
        clearTimeout(timeout);
        this.cleanupSession(client.id);
        done();
      });

      const connectOpts: any = {
        host: bastionHost,
        port: bastionPort,
        username: bastionUser,
        readyTimeout: 15000,
      };

      if (rawKey) {
        connectOpts.privateKey = rawKey;
      } else if (bastionPass) {
        connectOpts.password = bastionPass;
      }

      ssh.connect(connectOpts);
    });
  }

  private registerTcpSession(client: Socket, tcp: net.Socket) {
    const session: VncSession = {
      send: (data) => {
        const buf = normalizeBinaryPayload(data);
        if (!tcp.destroyed) {
          try {
            tcp.write(buf);
          } catch {
            // ignore closed socket writes
          }
        }
      },
      cleanup: () => {
        try {
          tcp.destroy();
        } catch {
          // ignore
        }
      },
    };

    this.sessions.set(client.id, session);

    tcp.on("data", (data: Buffer) => client.emit("vnc:data", data));
    tcp.on("close", () => {
      client.emit("vnc:close", "VNC session ended");
      this.cleanupSession(client.id);
    });
  }

  private cleanupSession(clientId: string) {
    this.sessions.get(clientId)?.cleanup();
    this.sessions.delete(clientId);
  }
}
