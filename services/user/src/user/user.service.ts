import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import {
  AdminSetSubscriptionDto,
  SubscriptionPlanId,
} from "./dto/admin-set-subscription.dto";
import * as bcrypt from "bcrypt";

type ManagedPlanId =
  | SubscriptionPlanId.STUDENT
  | SubscriptionPlanId.PRO
  | SubscriptionPlanId.ENTERPRISE;

type ManagedPlanConfig = {
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
  monthlyPriceDt: number;
  vmHoursMonthly: number;
  rank: number;
};

function loadManagedSubscriptionCatalogFromEnv(): Record<ManagedPlanId, ManagedPlanConfig> {
  const raw = process.env.PLAN_CATALOG_JSON;
  if (!raw) {
    throw new Error("Missing PLAN_CATALOG_JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid PLAN_CATALOG_JSON: must be valid JSON");
  }

  const record = parsed as Record<string, {
    amountDt: number;
    rank: number;
    vmHoursMonthly: number;
    quota: {
      maxVms: number;
      maxCpu: number;
      maxRamMb: number;
      maxDiskGb: number;
    };
  }>;

  const requiredPlans: ManagedPlanId[] = [
    SubscriptionPlanId.STUDENT,
    SubscriptionPlanId.PRO,
    SubscriptionPlanId.ENTERPRISE,
  ];

  for (const planId of requiredPlans) {
    const cfg = record?.[planId];
    if (!cfg) {
      throw new Error(`PLAN_CATALOG_JSON missing '${planId}' config`);
    }

    if (
      !Number.isFinite(cfg.amountDt) || cfg.amountDt <= 0 ||
      !Number.isFinite(cfg.rank) || cfg.rank < 1 ||
      !Number.isFinite(cfg.vmHoursMonthly) || cfg.vmHoursMonthly <= 0 ||
      !cfg.quota ||
      !Number.isFinite(cfg.quota.maxVms) || cfg.quota.maxVms < 1 ||
      !Number.isFinite(cfg.quota.maxCpu) || cfg.quota.maxCpu < 1 ||
      !Number.isFinite(cfg.quota.maxRamMb) || cfg.quota.maxRamMb < 512 ||
      !Number.isFinite(cfg.quota.maxDiskGb) || cfg.quota.maxDiskGb < 5
    ) {
      throw new Error(`Invalid PLAN_CATALOG_JSON values for '${planId}'`);
    }
  }

  return {
    [SubscriptionPlanId.STUDENT]: {
      maxVms: record.student.quota.maxVms,
      maxCpu: record.student.quota.maxCpu,
      maxRamMb: record.student.quota.maxRamMb,
      maxDiskGb: record.student.quota.maxDiskGb,
      monthlyPriceDt: record.student.amountDt,
      vmHoursMonthly: record.student.vmHoursMonthly,
      rank: record.student.rank,
    },
    [SubscriptionPlanId.PRO]: {
      maxVms: record.pro.quota.maxVms,
      maxCpu: record.pro.quota.maxCpu,
      maxRamMb: record.pro.quota.maxRamMb,
      maxDiskGb: record.pro.quota.maxDiskGb,
      monthlyPriceDt: record.pro.amountDt,
      vmHoursMonthly: record.pro.vmHoursMonthly,
      rank: record.pro.rank,
    },
    [SubscriptionPlanId.ENTERPRISE]: {
      maxVms: record.enterprise.quota.maxVms,
      maxCpu: record.enterprise.quota.maxCpu,
      maxRamMb: record.enterprise.quota.maxRamMb,
      maxDiskGb: record.enterprise.quota.maxDiskGb,
      monthlyPriceDt: record.enterprise.amountDt,
      vmHoursMonthly: record.enterprise.vmHoursMonthly,
      rank: record.enterprise.rank,
    },
  };
}

const MANAGED_SUBSCRIPTION_CATALOG = loadManagedSubscriptionCatalogFromEnv();

const SUBSCRIPTION_QUOTAS: Record<SubscriptionPlanId, {
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
  monthlyPriceDt: number;
  vmHoursMonthly: number;
  rank: number;
}> = {
  [SubscriptionPlanId.STUDENT]: MANAGED_SUBSCRIPTION_CATALOG[SubscriptionPlanId.STUDENT],
  [SubscriptionPlanId.PRO]: MANAGED_SUBSCRIPTION_CATALOG[SubscriptionPlanId.PRO],
  [SubscriptionPlanId.ENTERPRISE]: MANAGED_SUBSCRIPTION_CATALOG[SubscriptionPlanId.ENTERPRISE],
  [SubscriptionPlanId.UNLIMITED]: {
    maxVms: 9999,
    maxCpu: 9999,
    maxRamMb: 999999,
    maxDiskGb: 99999,
    monthlyPriceDt: 0,
    vmHoursMonthly: Number.MAX_SAFE_INTEGER,
    rank: 99,
  },
};

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly UNLIMITED_QUOTA = {
    maxVms: SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxVms,
    maxCpu: SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxCpu,
    maxRamMb: SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxRamMb,
    maxDiskGb: SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxDiskGb,
  };

  private assertAdminRole(actorRole?: string) {
    // SECURITY: Defense in depth — service-level check is independent of gateway.
    if (actorRole !== "ADMIN") {
      throw new ForbiddenException("Admin role required");
    }
  }


  private excludePassword(user: any) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private resolvePlanFromQuota(quota?: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  } | null): SubscriptionPlanId {
    if (!quota) return SubscriptionPlanId.STUDENT;

    if (
      quota.maxVms >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxVms ||
      quota.maxCpu >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.UNLIMITED].maxCpu
    ) {
      return SubscriptionPlanId.UNLIMITED;
    }

    if (
      quota.maxVms >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.ENTERPRISE].maxVms &&
      quota.maxCpu >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.ENTERPRISE].maxCpu
    ) {
      return SubscriptionPlanId.ENTERPRISE;
    }

    if (
      quota.maxVms >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.PRO].maxVms &&
      quota.maxCpu >= SUBSCRIPTION_QUOTAS[SubscriptionPlanId.PRO].maxCpu
    ) {
      return SubscriptionPlanId.PRO;
    }

    return SubscriptionPlanId.STUDENT;
  }

  private async upsertQuota(userId: string, planId: SubscriptionPlanId) {
    const quota = SUBSCRIPTION_QUOTAS[planId];
    return this.prisma.userQuota.upsert({
      where: { userId },
      update: {
        maxVms: quota.maxVms,
        maxCpu: quota.maxCpu,
        maxRamMb: quota.maxRamMb,
        maxDiskGb: quota.maxDiskGb,
      },
      create: {
        userId,
        maxVms: quota.maxVms,
        maxCpu: quota.maxCpu,
        maxRamMb: quota.maxRamMb,
        maxDiskGb: quota.maxDiskGb,
      },
    });
  }


  private resolvePlanForUser(args: {
    role: string;
    quota?: {
      maxVms: number;
      maxCpu: number;
      maxRamMb: number;
      maxDiskGb: number;
    } | null;
  }): SubscriptionPlanId {
    if (args.role === "ADMIN") {
      return SubscriptionPlanId.UNLIMITED;
    }


    return this.resolvePlanFromQuota(args.quota);
  }

  private getBillingCycleEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  private estimateVmHoursUsed(
    vms: Array<{
      status: string;
      createdAt: Date;
      stoppedAt: Date | null;
    }>,
    cycleStart: Date,
    cycleEnd: Date,
  ): number {
    let totalHours = 0;

    for (const vm of vms) {
      const started = vm.createdAt > cycleStart ? vm.createdAt : cycleStart;
      const nonRunningEnd = vm.stoppedAt ?? cycleEnd;
      const ended = vm.status === "RUNNING"
        ? cycleEnd
        : nonRunningEnd < cycleEnd
          ? nonRunningEnd
          : cycleEnd;

      if (ended <= started) continue;
      totalHours += (ended.getTime() - started.getTime()) / (1000 * 60 * 60);
    }

    return Number(totalHours.toFixed(2));
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        quota: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const resourceUsage = await this.prisma.virtualMachine.aggregate({
      where: { userId, status: { not: "DELETED" as any } },
      _sum: { cpu: true, ramMb: true, diskGb: true },
      _count: { id: true },
    });

    const now = new Date();

    const planId = this.resolvePlanForUser({
      role: user.role,
      quota: user.quota,
    });

    const cycleStartedAt = new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleEndsAt = this.getBillingCycleEnd(cycleStartedAt);
    const vmHoursIncluded = SUBSCRIPTION_QUOTAS[planId].vmHoursMonthly;

    const vmsForHours = await this.prisma.virtualMachine.findMany({
      where: {
        userId,
        createdAt: { gte: cycleStartedAt },
        status: { not: "DELETED" as any },
      },
      select: { status: true, createdAt: true, stoppedAt: true },
    });

    const vmHoursUsed = this.estimateVmHoursUsed(
      vmsForHours,
      cycleStartedAt,
      now < cycleEndsAt ? now : cycleEndsAt,
    );
    const vmHoursRemaining = planId === SubscriptionPlanId.UNLIMITED
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Number((vmHoursIncluded - vmHoursUsed).toFixed(2)));

    const cpuUsed = resourceUsage._sum.cpu ?? 0;
    const ramMbUsed = resourceUsage._sum.ramMb ?? 0;
    const diskGbUsed = resourceUsage._sum.diskGb ?? 0;
    const vmCount = resourceUsage._count.id ?? 0;

    const safeUser = this.excludePassword(user);
    const effectiveQuota = user.role === "ADMIN"
      ? UserService.UNLIMITED_QUOTA
      : user.quota;

    return {
      ...safeUser,
      quota: effectiveQuota,
      usage: {
        vmCount,
        cpuUsed,
        ramMbUsed,
        diskGbUsed,
      },
      subscription: {
        planId,
        cycleStartedAt,
        cycleEndsAt,
        vmHoursIncluded,
        vmHoursUsed,
        vmHoursRemaining,
        canRenewSamePlan:
          planId === SubscriptionPlanId.UNLIMITED
            ? false
            : now >= cycleEndsAt || vmHoursUsed >= vmHoursIncluded,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Email already in use");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    return this.excludePassword(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const isPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: "Password changed successfully" };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    actorRole?: string,
  ) {
    this.assertAdminRole(actorRole);
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { quota: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.excludePassword(user)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, actorRole?: string) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        quota: true,
        sshKeys: true,
        virtualMachines: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.excludePassword(user);
  }

  async adminUpdateUser(
    id: string,
    dto: AdminUpdateUserDto,
    actorRole?: string,
    actorUserId?: string,
  ) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (id === actorUserId && dto.role && dto.role !== "ADMIN") {
      throw new ForbiddenException("You cannot remove your own admin role");
    }

    if (id === actorUserId && dto.isActive === false) {
      throw new ForbiddenException("You cannot deactivate your own account");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    if (dto.role === "ADMIN") {
      await this.upsertQuota(id, SubscriptionPlanId.UNLIMITED);
    }

    if (user.role === "ADMIN" && dto.role === "USER") {
      await this.upsertQuota(id, SubscriptionPlanId.STUDENT);
    }

    return this.excludePassword(updated);
  }

  async setUserSubscription(
    id: string,
    dto: AdminSetSubscriptionDto,
    actorRole?: string,
    actorUserId?: string,
  ) {
    this.assertAdminRole(actorRole);

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { quota: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (id === actorUserId && user.role === "ADMIN" && dto.planId !== SubscriptionPlanId.UNLIMITED) {
      throw new ForbiddenException("Admin accounts must remain on unlimited subscription");
    }

    const finalPlan = user.role === "ADMIN" ? SubscriptionPlanId.UNLIMITED : dto.planId;
    const quota = await this.upsertQuota(id, finalPlan);


    return {
      message: "Subscription updated successfully",
      subscription: finalPlan,
      quota,
      userId: id,
    };
  }

  async getUserBillingSummary(id: string, actorRole?: string) {
    this.assertAdminRole(actorRole);


    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        quota: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const paidPayments: Array<{ amount: number }> = [];
    const totalSpent = 0;
    const lastPaid = null;

    return {
      user: this.excludePassword(user),
      subscription: this.resolvePlanForUser({
        role: user.role,
        quota: user.quota,
      }),
      totalSpent,
      paidPaymentsCount: paidPayments.length,
      pendingPaymentsCount: 0,
      lastPaid,
      recentPayments: [],
      billingSource: "quota_only",
    };
  }

  async getAdminBillingOverview(
    actorRole?: string,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    this.assertAdminRole(actorRole);


    const skip = (page - 1) * limit;

    const userWhere = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, totalUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        include: {
          quota: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    const recentPayments: any[] = [];
    const paidPayments = 0;
    const pendingPayments = 0;
    const totalRevenue = { _sum: { amount: 0 } };

    const usersWithSubscription = users.map((user: any) => ({
      ...this.excludePassword(user),
      subscription: this.resolvePlanForUser({
        role: user.role,
        quota: user.quota,
      }),
    }));

    return {
      overview: {
        totalUsers,
        paidPayments,
        pendingPayments,
        totalRevenueTnd: totalRevenue._sum.amount ?? 0,
      },
      users: usersWithSubscription,
      recentPayments,
      page,
      limit,
      billingSource: "quota_only",
    };
  }

  async deleteUser(id: string, actorRole?: string) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: "User deleted successfully" };
  }

  async getStats(actorRole?: string) {
    this.assertAdminRole(actorRole);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, newThisMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    return { total, active, newThisMonth };
  }
}
