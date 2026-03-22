import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NatsService } from "../nats/nats.service";
import { CreateVmDto } from "./dto/create-vm.dto";
import { VmStatus } from "@prisma/client";

@Injectable()
export class VmService {
  private readonly logger = new Logger(VmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async createVm(dto: CreateVmDto, userId: string) {
    // Check user quota
    const quota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    const activeVms = await this.prisma.virtualMachine.count({
      where: {
        userId,
        status: { notIn: [VmStatus.DELETED] },
      },
    });

    const maxVms = quota?.maxVms ?? 3;
    const maxCpu = quota?.maxCpu ?? 4;
    const maxRamMb = quota?.maxRamMb ?? 4096;
    const maxDiskGb = quota?.maxDiskGb ?? 50;

    if (activeVms >= maxVms) {
      throw new BadRequestException(
        `VM quota exceeded. Maximum ${maxVms} VMs allowed.`,
      );
    }

    // Sum current resource usage
    const currentUsage = await this.prisma.virtualMachine.aggregate({
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
      throw new BadRequestException(
        `CPU quota exceeded. Used: ${usedCpu}, Requested: ${dto.cpu}, Max: ${maxCpu}`,
      );
    }
    if (usedRam + dto.ramMb > maxRamMb) {
      throw new BadRequestException(
        `RAM quota exceeded. Used: ${usedRam}MB, Requested: ${dto.ramMb}MB, Max: ${maxRamMb}MB`,
      );
    }
    if (usedDisk + dto.diskGb > maxDiskGb) {
      throw new BadRequestException(
        `Disk quota exceeded. Used: ${usedDisk}GB, Requested: ${dto.diskGb}GB, Max: ${maxDiskGb}GB`,
      );
    }

    // Create VM record
    const vm = await this.prisma.virtualMachine.create({
      data: {
        name: dto.name,
        cpu: dto.cpu,
        ramMb: dto.ramMb,
        diskGb: dto.diskGb,
        osTemplate: dto.osTemplate,
        userId,
        planId: dto.planId || null,
        status: VmStatus.PENDING,
      },
    });

    // Publish to NATS for the worker to create the VM
    await this.nats.publish("vm.create", {
      vmId: vm.id,
      name: vm.name,
      cpu: vm.cpu,
      ramMb: vm.ramMb,
      diskGb: vm.diskGb,
      osTemplate: vm.osTemplate,
      userId,
    });

    this.logger.log(`VM ${vm.id} created and queued for provisioning`);
    return vm;
  }

  async listVms(
    userId: string,
    role: string,
    query?: { status?: string; search?: string; page?: number; limit?: number },
  ) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
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
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!vm) {
      throw new NotFoundException("Virtual machine not found");
    }

    if (role !== "ADMIN" && vm.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return vm;
  }

  async vmAction(vmId: string, action: string, userId: string, role: string) {
    const vm = await this.getVm(vmId, userId, role);

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

    this.logger.log(`Action '${action}' published for VM ${vm.id}`);

    return { message: `Action '${action}' queued for VM ${vm.name}` };
  }

  async deleteVm(vmId: string, userId: string, role: string) {
    const vm = await this.getVm(vmId, userId, role);

    // Soft delete: set status to DELETED
    await this.prisma.virtualMachine.update({
      where: { id: vmId },
      data: { status: VmStatus.DELETED },
    });

    // Publish to NATS so worker can destroy the VM on the hypervisor
    await this.nats.publish("vm.delete", {
      vmId: vm.id,
      oneVmId: vm.oneVmId,
      userId,
    });

    this.logger.log(`VM ${vm.id} marked as DELETED`);

    return { message: `VM '${vm.name}' has been deleted` };
  }

  async getTemplates(): Promise<{ id: number; name: string }[]> {
    try {
      const result = await this.nats.request("vm.templates.list", {});
      return result.templates ?? [];
    } catch (e) {
      this.logger.error("Failed to fetch templates from worker", e);
      return [];
    }
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
