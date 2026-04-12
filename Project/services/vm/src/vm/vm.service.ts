import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NatsService } from "../nats/nats.service";
import { CreateVmDto } from "./dto/create-vm.dto";
import { VmStatus } from "@prisma/client";
import { generateKeyPairSync } from "crypto";
import sshpk from "sshpk";

@Injectable()
export class VmService {
  private readonly logger = new Logger(VmService.name);

  private generateVmSshKeyPair() {
    // Use RSA-2048 instead of ed25519 for three reasons:
    //
    // 1. Node.js exports RSA private keys as PKCS#1 PEM
    //    ("-----BEGIN RSA PRIVATE KEY-----"), which ssh2 accepts natively —
    //    no format conversion step needed, no silent fallback risk.
    //
    // 2. Every RSA key is visually unique from the very first base64 character.
    //    ed25519 OpenSSH keys share a long constant header that spans several
    //    lines, making different keys look identical at a glance.
    //
    // 3. RSA 2048 is universally supported by all SSH server/client versions.
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    // PKCS#1 PEM — directly usable by the ssh2 library with no conversion
    const privateKeyPem = privateKey.export({
      type: "pkcs1",
      format: "pem",
    }) as string;

    // Convert RSA public key SPKI → OpenSSH authorized_keys format
    const publicKeySpki = publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;

    let publicKeySsh: string;
    try {
      publicKeySsh = sshpk.parseKey(publicKeySpki, "pem").toString("ssh").trim();
    } catch (err) {
      this.logger.error("sshpk failed to convert RSA public key", err);
      throw new InternalServerErrorException(
        "Failed to generate a valid SSH public key",
      );
    }

    if (!publicKeySsh || !publicKeySsh.startsWith("ssh-rsa")) {
      throw new InternalServerErrorException(
        "Generated public key does not look like a valid ssh-rsa key",
      );
    }

    this.logger.log(
      `Generated RSA-2048 SSH key pair (pub prefix = ${publicKeySsh.split(" ")[1]?.substring(0, 16)}…)`,
    );

    return { privateKeyPem, publicKeySsh };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async createVm(dto: CreateVmDto, userId: string) {
    const vmKeyPair = this.generateVmSshKeyPair();

    this.logger.log(
      `Generated VM SSH key pair (public prefix=${vmKeyPair.publicKeySsh.split(" ")[0]}, length=${vmKeyPair.publicKeySsh.length})`,
    );

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
        sshUsername: "cloudvm",
      },
    });

    // Publish to NATS for the worker to create the VM
    this.logger.log(
      `Publishing vm.create for ${vm.id} with sshPublicKey length=${vmKeyPair.publicKeySsh.length}`,
    );
    await this.nats.publish("vm.create", {
      vmId: vm.id,
      name: vm.name,
      cpu: vm.cpu,
      ramMb: vm.ramMb,
      diskGb: vm.diskGb,
      osTemplate: vm.osTemplate,
      userId,
      sshPublicKey: vmKeyPair.publicKeySsh,
    });

    // Also publish SSH private key readiness so real-time UI channels can
    // persist the key for terminal usage (in addition to HTTP response body).
    await this.nats.publish("vm.ssh.ready", {
      vmId: vm.id,
      userId,
      privateKey: vmKeyPair.privateKeyPem,
    });

    this.logger.log(`VM ${vm.id} created and queued for provisioning`);
    return {
      ...vm,
      generatedSshPrivateKey: vmKeyPair.privateKeyPem,
    };
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

    // Publish to NATS so worker can destroy the VM on the hypervisor
    await this.nats.publish("vm.delete", {
      vmId: vm.id,
      oneVmId: vm.oneVmId,
      userId,
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
