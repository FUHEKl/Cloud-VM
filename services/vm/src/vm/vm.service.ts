import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { NatsService } from "../nats/nats.service";
import { CreateVmDto } from "./dto/create-vm.dto";
import { Prisma, VmStatus } from "@prisma/client";
import { encryptVmPrivateKey } from "./vm-ssh-key.crypto";
import { randomUUID } from "crypto";

type InternalQuotaSnapshot = {
  hasActiveSubscription: boolean;
  planId: string | null;
  quota: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  } | null;
};

type InternalSubscriptionAccessSnapshot = {
  activePlanId: string | null;
  canPurchaseSameOrLower: boolean;
  usageRatio: number;
  cycleEndsAt?: string;
  vmHoursUsed?: number;
  vmHoursIncluded?: number;
};

@Injectable()
export class VmService {
  private readonly logger = new Logger(VmService.name);

  private logSecurityEvent(eventType: string, payload: Record<string, unknown>) {
    // SECURITY: structured audit logging for VM authorization and lifecycle actions.
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        eventType,
        ...payload,
      }),
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private getUserServiceUrl(): string {
    const url = (process.env.USER_SERVICE_URL || "http://user:3003").trim();
    if (!url) {
      throw new InternalServerErrorException("Missing USER_SERVICE_URL configuration");
    }
    return url;
  }

  private getInterServiceSyncToken(): string {
    const token = (process.env.INTER_SERVICE_SYNC_TOKEN || "").trim();
    if (!token) {
      throw new InternalServerErrorException("Missing INTER_SERVICE_SYNC_TOKEN configuration");
    }
    return token;
  }

  private getPlatformBaseUrl(): string {
    const raw = (process.env.PLATFORM_URL || "").trim();
    if (!raw) {
      throw new InternalServerErrorException("Missing PLATFORM_URL configuration");
    }
    return raw.replace(/\/$/, "");
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    errorMessage: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      return response;
    } catch (error) {
      throw new InternalServerErrorException(errorMessage);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchInternalQuotaSnapshot(userId: string): Promise<InternalQuotaSnapshot | null> {
    const url = `${this.getUserServiceUrl()}/users/internal/quota/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await this.fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { "x-sync-token": syncToken },
      },
      "Failed to load user quota snapshot",
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new InternalServerErrorException("Failed to load user quota snapshot");
    }

    return (await response.json()) as InternalQuotaSnapshot;
  }

  private async fetchInternalSubscriptionAccessSnapshot(
    userId: string,
  ): Promise<InternalSubscriptionAccessSnapshot | null> {
    const url = `${this.getUserServiceUrl()}/users/internal/subscription-access/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await this.fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { "x-sync-token": syncToken },
      },
      "Failed to load subscription access snapshot",
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new InternalServerErrorException("Failed to load subscription access snapshot");
    }

    return (await response.json()) as InternalSubscriptionAccessSnapshot;
  }

  async createVm(dto: CreateVmDto, userId: string, role: string) {
    const isAdmin = role === "ADMIN";
    const guiCallbackToken = randomUUID();

    let remoteQuota: InternalQuotaSnapshot | null = null;
    if (!isAdmin) {
      remoteQuota = await this.fetchInternalQuotaSnapshot(userId);
    }

    const vmPasswordEncrypted = encryptVmPrivateKey(dto.vmPassword);

    let vm;
    try {
      vm = await this.prisma.$transaction(
        async (tx) => {
        // SECURITY: per-user transaction lock prevents TOCTOU quota bypass
        // when concurrent create requests hit at the same time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

        let quota = await tx.userQuota.findUnique({
          where: { userId },
        });

        if (!isAdmin && remoteQuota?.hasActiveSubscription && remoteQuota.quota) {
          quota = await tx.userQuota.upsert({
            where: { userId },
            update: {
              maxVms: remoteQuota.quota.maxVms,
              maxCpu: remoteQuota.quota.maxCpu,
              maxRamMb: remoteQuota.quota.maxRamMb,
              maxDiskGb: remoteQuota.quota.maxDiskGb,
            },
            create: {
              userId,
              maxVms: remoteQuota.quota.maxVms,
              maxCpu: remoteQuota.quota.maxCpu,
              maxRamMb: remoteQuota.quota.maxRamMb,
              maxDiskGb: remoteQuota.quota.maxDiskGb,
            },
          });
        }

        if (!isAdmin && !quota) {
          throw new ForbiddenException(
            "No active subscription found. Please purchase a plan before creating VMs.",
          );
        }

        const activeVms = await tx.virtualMachine.count({
          where: {
            userId,
            status: { notIn: [VmStatus.DELETED] },
          },
        });

        const maxVms = isAdmin ? Number.MAX_SAFE_INTEGER : (quota?.maxVms ?? 0);
        const maxCpu = isAdmin ? Number.MAX_SAFE_INTEGER : (quota?.maxCpu ?? 0);
        const maxRamMb = isAdmin ? Number.MAX_SAFE_INTEGER : (quota?.maxRamMb ?? 0);
        const maxDiskGb = isAdmin ? Number.MAX_SAFE_INTEGER : (quota?.maxDiskGb ?? 0);

        if (activeVms >= maxVms) {
          throw new ForbiddenException(
            `VM quota exceeded. Maximum ${maxVms} VMs allowed.`,
          );
        }

        const currentUsage = await tx.virtualMachine.aggregate({
          where: {
            userId,
            status: { notIn: [VmStatus.DELETED] },
          },
          _sum: { cpu: true, ramMb: true, diskGb: true },
        });

        const usedCpu = currentUsage._sum.cpu ?? 0;
        const usedRam = currentUsage._sum.ramMb ?? 0;
        const usedDisk = currentUsage._sum.diskGb ?? 0;

        if (usedCpu + dto.cpu > maxCpu) {
          throw new ForbiddenException(
            `CPU quota exceeded. Used: ${usedCpu}, Requested: ${dto.cpu}, Max: ${maxCpu}`,
          );
        }
        if (usedRam + dto.ramMb > maxRamMb) {
          throw new ForbiddenException(
            `RAM quota exceeded. Used: ${usedRam}MB, Requested: ${dto.ramMb}MB, Max: ${maxRamMb}MB`,
          );
        }
        if (usedDisk + dto.diskGb > maxDiskGb) {
          throw new ForbiddenException(
            `Disk quota exceeded. Used: ${usedDisk}GB, Requested: ${dto.diskGb}GB, Max: ${maxDiskGb}GB`,
          );
        }

        return tx.virtualMachine.create({
          data: {
            name: dto.name,
            cpu: dto.cpu,
            ramMb: dto.ramMb,
            diskGb: dto.diskGb,
            osTemplate: dto.osTemplate,
            userId,
            planId: dto.planId || null,
            status: VmStatus.PENDING,
            sshUsername: dto.vmUsername,
            vmPasswordEncrypted,
            guiCallbackToken,
          },
        });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("You already have a VM with this name");
      }
      throw error;
    }

    const platformBaseUrl = this.getPlatformBaseUrl();
    const guiCallbackUrl = `${platformBaseUrl}/api/vms/${vm.id}/gui-ready`;

    // Publish to NATS for the worker to create the VM
    await this.nats.publish("vm.create", {
      vmId: vm.id,
      name: vm.name,
      cpu: vm.cpu,
      ramMb: vm.ramMb,
      diskGb: vm.diskGb,
      osTemplate: vm.osTemplate,
      userId,
      vmUsername: dto.vmUsername,
      vmPasswordB64: Buffer.from(dto.vmPassword).toString("base64"),
      guiCallbackUrl,
      guiCallbackToken,
    });

    this.logSecurityEvent("vm.action.queued", {
      userId,
      vmId: vm.id,
      action: "create",
      result: "success",
    });

    this.logger.log(`VM ${vm.id} created and queued for provisioning`);
    return vm;
  }

  async markGuiReady(vmId: string, token: string): Promise<void> {
    const vm = await this.prisma.virtualMachine.findUnique({ where: { id: vmId } });

    if (!vm) {
      throw new NotFoundException(`Virtual machine ${vmId} not found`);
    }

    if (!vm.guiCallbackToken || vm.guiCallbackToken !== token) {
      this.logSecurityEvent("vm.gui.callback.invalid", {
        vmId,
        result: "denied",
      });
      throw new ForbiddenException("Invalid or already-used GUI callback token");
    }

    if (vm.guiReady) {
      return;
    }

    await this.prisma.virtualMachine.update({
      where: { id: vmId },
      data: {
        guiReady: true,
        guiReadyAt: new Date(),
        guiCallbackToken: null,
      },
    });

    this.eventEmitter.emit("vm.guiReady", { vmId });
  }

  async listVms(
    userId: string,
    role: string,
    query?: { status?: string; search?: string; page?: number; limit?: number },
  ) {
    const page = query?.page ?? 1;
    const limit = Math.min(query?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    // Non-admin users can only see their own VMs
    if (role !== "ADMIN") {
      where.userId = userId;
    }

    if (query?.status) {
      where.status = query.status as VmStatus;
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { ipAddress: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // Exclude soft-deleted VMs unless specifically queried
    if (!query?.status) {
      where.status = { not: VmStatus.DELETED };
    }

    const [vms, total] = await Promise.all([
      this.prisma.virtualMachine.findMany({
        where,
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.virtualMachine.count({ where }),
    ]);

    return {
      data: vms,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getVm(vmId: string, userId: string, role: string) {
    const vm = await this.prisma.virtualMachine.findUnique({
      where: { id: vmId },
      include: {
        plan: true,
      },
    });

    if (!vm) {
      throw new NotFoundException("Virtual machine not found");
    }

    if (role !== "ADMIN" && vm.userId !== userId) {
      this.logSecurityEvent("vm.permission.denied", {
        userId,
        vmId,
        result: "denied",
      });
      throw new ForbiddenException("Access denied");
    }

    return vm;
  }

  async vmAction(vmId: string, action: string, userId: string, role: string) {
    const vm = await this.getVm(vmId, userId, role);

    const isAdmin = role === "ADMIN";
    if (!isAdmin && (action === "start" || action === "restart")) {
      const access = await this.fetchInternalSubscriptionAccessSnapshot(userId);

      if (!access?.activePlanId) {
        throw new ForbiddenException("No active subscription found. Please purchase a plan.");
      }

      if (
        access.activePlanId !== "unlimited" &&
        Number.isFinite(access.vmHoursIncluded) &&
        Number.isFinite(access.vmHoursUsed) &&
        (access.vmHoursUsed ?? 0) >= (access.vmHoursIncluded ?? 0)
      ) {
        throw new ForbiddenException(
          "VM-hour limit reached for the current billing cycle. Stop VMs or upgrade your plan.",
        );
      }
    }

    // Validate action based on current status
    const validTransitions: Record<string, string[]> = {
      start: ["STOPPED", "SUSPENDED", "ERROR"],
      stop: ["RUNNING"],
      restart: ["RUNNING"],
      delete: ["RUNNING", "STOPPED", "SUSPENDED", "ERROR", "PENDING"],
    };

    const allowed = validTransitions[action];
    if (!allowed || !allowed.includes(vm.status)) {
      throw new BadRequestException(
        `Cannot perform '${action}' on a VM with status '${vm.status}'`,
      );
    }

    // Publish action to NATS
    await this.nats.publish("vm.action", {
      vmId: vm.id,
      oneVmId: vm.oneVmId,
      action,
      userId,
    });

    this.logSecurityEvent("vm.action.queued", {
      userId,
      vmId: vm.id,
      action,
      result: "success",
    });

    this.logger.log(`Action '${action}' published for VM ${vm.id}`);

    return { message: `Action '${action}' queued for VM ${vm.name}` };
  }

  async deleteVm(vmId: string, userId: string, role: string) {
    const vm = await this.getVm(vmId, userId, role);

    if (vm.status === VmStatus.DELETED) {
      throw new BadRequestException(`VM '${vm.name}' is already deleted`);
    }

    // Publish to NATS so worker can destroy the VM on the hypervisor
    await this.nats.publish("vm.delete", {
      vmId: vm.id,
      oneVmId: vm.oneVmId,
      userId,
    });

    this.logSecurityEvent("vm.action.queued", {
      userId,
      vmId: vm.id,
      action: "delete",
      result: "success",
    });

    this.logger.log(`VM ${vm.id} delete requested (OpenNebula + DB)`);

    return { message: `VM '${vm.name}' deletion queued` };
  }

  async getTemplates(): Promise<Array<{ id: number; name: string }>> {
    const result = await this.nats.request<Array<{ id: number; name: string }>>(
      "templates.list",
      {},
    );
    return result ?? [];
  }

  async getStats(userId: string, role: string) {
    const where: Record<string, any> = role === "ADMIN" ? {} : { userId };

    const [total, running, stopped, pending, error] = await Promise.all([
      this.prisma.virtualMachine.count({
        where: { ...where, status: { not: VmStatus.DELETED } },
      }),
      this.prisma.virtualMachine.count({
        where: { ...where, status: VmStatus.RUNNING },
      }),
      this.prisma.virtualMachine.count({
        where: { ...where, status: VmStatus.STOPPED },
      }),
      this.prisma.virtualMachine.count({
        where: { ...where, status: VmStatus.PENDING },
      }),
      this.prisma.virtualMachine.count({
        where: { ...where, status: VmStatus.ERROR },
      }),
    ]);

    const resourceUsage = await this.prisma.virtualMachine.aggregate({
      where: {
        ...where,
        status: { in: [VmStatus.RUNNING, VmStatus.STOPPED, VmStatus.PENDING] },
      },
      _sum: { cpu: true, ramMb: true, diskGb: true },
    });

    return {
      total,
      running,
      stopped,
      pending,
      error,
      resources: {
        totalCpu: resourceUsage._sum.cpu ?? 0,
        totalRamMb: resourceUsage._sum.ramMb ?? 0,
        totalDiskGb: resourceUsage._sum.diskGb ?? 0,
      },
    };
  }
}
