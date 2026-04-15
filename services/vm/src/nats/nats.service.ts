import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  connect,
  NatsConnection,
  StringCodec,
  Subscription,
  JetStreamClient,
  RetentionPolicy,
  StorageType,
} from "nats";
import { PrismaService } from "../prisma/prisma.service";
import { VmStatus } from "@prisma/client";

const DB_STATUSES = new Set<string>([
  "PENDING",
  "RUNNING",
  "STOPPED",
  "SUSPENDED",
  "ERROR",
  "DELETED",
]);

// These subjects must be published via JetStream (worker uses durable consumers)
const JS_SUBJECTS = new Set(["vm.create", "vm.action", "vm.delete"]);

@Injectable()
export class NatsService implements OnModuleInit {
  private connection!: NatsConnection;
  private js!: JetStreamClient;
  private readonly sc = StringCodec();
  private readonly logger = new Logger(NatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
    let retries = 12;
    while (retries-- > 0) {
      try {
        this.connection = await connect({ servers: natsUrl });
        this.js = this.connection.jetstream();
        this.logger.log(`Connected to NATS at ${natsUrl}`);
        await this.ensureStream();
        this.subscribeToStatusUpdates();
        return;
      } catch (error) {
        this.logger.warn(`NATS connect failed, retrying… (${retries} left): ${error}`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    this.logger.error("Failed to connect to NATS after retries");
  }

  private async ensureStream(): Promise<void> {
    const jsm = await this.connection.jetstreamManager();
    try {
      await jsm.streams.info("VM");
      this.logger.log("JetStream stream 'VM' already exists");
    } catch {
      await jsm.streams.add({
        name: "VM",
        subjects: ["vm.>"],
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
        max_msgs: 100_000,
        max_age: 24 * 60 * 60 * 1_000_000_000, // 24h in ns
      });
      this.logger.log("Created JetStream stream 'VM'");
    }
  }

  async publish(subject: string, data: Record<string, any>): Promise<void> {
    if (!this.connection) {
      this.logger.warn("NATS not connected, cannot publish");
      return;
    }
    const payload = this.sc.encode(JSON.stringify(data));
    if (JS_SUBJECTS.has(subject)) {
      try {
        await this.js.publish(subject, payload);
        this.logger.log(`JetStream published to ${subject}`);
      } catch (err) {
        this.logger.error(`JetStream publish to '${subject}' failed: ${err}`);
        throw err;
      }
    } else {
      this.connection.publish(subject, payload);
      this.logger.log(`Core NATS published to ${subject}`);
    }
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

  async request<T = any>(
    subject: string,
    data: Record<string, any>,
    timeoutMs = 8000,
  ): Promise<T | null> {
    if (!this.connection) {
      this.logger.warn("NATS not connected, cannot send request");
      return null;
    }
    try {
      const msg = await this.connection.request(
        subject,
        this.sc.encode(JSON.stringify(data)),
        { timeout: timeoutMs },
      );
      return JSON.parse(this.sc.decode(msg.data)) as T;
    } catch (error) {
      this.logger.error(`NATS request to '${subject}' failed: ${error}`);
      return null;
    }
  }

  private subscribeToStatusUpdates() {
    this.subscribe("vm.status.update", async (data) => {
      const { vmId, status, ipAddress, oneVmId, sshHost, sshPort } = data;
      this.logger.log(`Received status update for VM ${vmId}: ${status}`);

      // Only write to DB for valid Prisma enum values.
      // Intermediate states (BOOT, PROLOG…) are still broadcast by VmEventsGateway.
      if (!DB_STATUSES.has(status)) {
        this.logger.log(`Skipping DB update for intermediate status: ${status}`);
        return;
      }

      if (status === "DELETED") {
        try {
          const updated = await this.prisma.virtualMachine.updateMany({
            where: { id: vmId },
            data: {
              status: VmStatus.DELETED,
              stoppedAt: new Date(),
            },
          });
          if (updated.count === 0) {
            this.logger.warn(`Skip DELETED sync: VM ${vmId} not found in this DB`);
          } else {
            this.logger.log(`Marked VM ${vmId} as DELETED in DB`);
          }
        } catch (error) {
          this.logger.error(`Failed to mark VM ${vmId} as DELETED`, error);
        }
        return;
      }

      const updateData: Record<string, any> = { status: status as VmStatus };
      if (status === "STOPPED" || status === "SUSPENDED" || status === "ERROR") {
        updateData.stoppedAt = new Date();
      } else if (status === "RUNNING") {
        updateData.stoppedAt = null;
      }
      if (ipAddress) updateData.ipAddress = ipAddress;
      if (oneVmId)   updateData.oneVmId   = oneVmId;
      if (sshHost)   updateData.sshHost   = sshHost;
      if (sshPort)   updateData.sshPort   = sshPort;

      try {
        const updated = await this.prisma.virtualMachine.updateMany({
          where: { id: vmId },
          data: updateData,
        });
        if (updated.count === 0) {
          this.logger.warn(`Skip status sync: VM ${vmId} not found in this DB`);
        } else {
          this.logger.log(`Persisted VM ${vmId} status=${status}`);
        }
      } catch (error) {
        this.logger.error(`Failed to update VM ${vmId}`, error);
      }
    });
  }
}
