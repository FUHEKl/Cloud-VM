import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { connect, NatsConnection, StringCodec, Subscription } from "nats";
import { PrismaService } from "../prisma/prisma.service";
import { VmStatus } from "@prisma/client";

@Injectable()
export class NatsService implements OnModuleInit {
  private connection!: NatsConnection;
  private readonly sc = StringCodec();
  private readonly logger = new Logger(NatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
      this.connection = await connect({ servers: natsUrl });
      this.logger.log(`Connected to NATS at ${natsUrl}`);
      this.subscribeToStatusUpdates();
    } catch (error) {
      this.logger.error("Failed to connect to NATS", error);
    }
  }

  async publish(subject: string, data: Record<string, any>): Promise<void> {
    if (!this.connection) {
      this.logger.warn("NATS not connected, cannot publish");
      return;
    }
    this.connection.publish(subject, this.sc.encode(JSON.stringify(data)));
    this.logger.log(`Published to ${subject}`);
  }

  async request(
    subject: string,
    data: Record<string, any> = {},
    timeoutMs = 5000,
  ): Promise<any> {
    if (!this.connection) {
      throw new Error("NATS not connected");
    }
    const msg = await this.connection.request(
      subject,
      this.sc.encode(JSON.stringify(data)),
      { timeout: timeoutMs },
    );
    return JSON.parse(this.sc.decode(msg.data));
  }

  subscribe(
    subject: string,
    callback: (data: Record<string, any>) => void,
  ): Subscription | undefined {
    if (!this.connection) {
      this.logger.warn("NATS not connected, cannot subscribe");
      return undefined;
    }
    const sub = this.connection.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.sc.decode(msg.data));
          callback(data);
        } catch (error) {
          this.logger.error(`Error processing message on ${subject}`, error);
        }
      }
    })();
    this.logger.log(`Subscribed to ${subject}`);
    return sub;
  }

  private subscribeToStatusUpdates() {
    this.subscribe("vm.status.update", async (data) => {
      const { vmId, status, ipAddress, oneVmId, sshHost, sshPort } = data;
      this.logger.log(`Received status update for VM ${vmId}: ${status}`);

      const updateData: Record<string, any> = {
        status: status as VmStatus,
      };
      if (ipAddress) updateData.ipAddress = ipAddress;
      if (oneVmId) updateData.oneVmId = oneVmId;
      if (sshHost) updateData.sshHost = sshHost;
      if (sshPort) updateData.sshPort = sshPort;

      try {
        await this.prisma.virtualMachine.update({
          where: { id: vmId },
          data: updateData,
        });
        this.logger.log(`Updated VM ${vmId} status to ${status}`);
      } catch (error) {
        this.logger.error(`Failed to update VM ${vmId}`, error);
      }
    });
  }
}
