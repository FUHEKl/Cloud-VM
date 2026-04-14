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

const SUBSCRIPTION_QUOTAS: Record<SubscriptionPlanId, {
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
  monthlyPriceDt: number;
  vmHoursMonthly: number;
  rank: number;
}> = {
  [SubscriptionPlanId.STUDENT]: {
    maxVms: 2,
    maxCpu: 2,
    maxRamMb: 4096,
    maxDiskGb: 40,
    monthlyPriceDt: 29,
    vmHoursMonthly: 60,
    rank: 1,
  },
  [SubscriptionPlanId.PRO]: {
    maxVms: 6,
    maxCpu: 8,
    maxRamMb: 16384,
    maxDiskGb: 120,
    monthlyPriceDt: 79,
    vmHoursMonthly: 220,
    rank: 2,
  },
  [SubscriptionPlanId.ENTERPRISE]: {
    maxVms: 20,
    maxCpu: 32,
    maxRamMb: 65536,
    maxDiskGb: 400,
    monthlyPriceDt: 199,
    vmHoursMonthly: 900,
    rank: 3,
  },
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

  private extractPlanFromPayment(payment: {
    method?: string | null;
    amount: number;
  }): SubscriptionPlanId | null {
    const method = (payment.method || "").toLowerCase();

    if (method.startsWith("admin:grant:")) {
      const candidate = method.split(":")[2] as SubscriptionPlanId | undefined;
      if (candidate && candidate in SUBSCRIPTION_QUOTAS) {
        return candidate;
      }
    }

    const planMatch = method.match(/:plan:(student|pro|enterprise|unlimited)/);
    if (planMatch?.[1]) {
      return planMatch[1] as SubscriptionPlanId;
    }

    if (payment.amount >= 199) return SubscriptionPlanId.ENTERPRISE;
    if (payment.amount >= 79) return SubscriptionPlanId.PRO;
    if (payment.amount >= 29) return SubscriptionPlanId.STUDENT;
    return null;
  }

  private getBillingCycleEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  private estimateVmHoursUsed(
    vms: Array<{
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
    cycleStart: Date,
    cycleEnd: Date,
  ): number {
    let totalHours = 0;

    for (const vm of vms) {
      const started = vm.createdAt > cycleStart ? vm.createdAt : cycleStart;
      const ended = vm.status === "RUNNING"
        ? cycleEnd
        : vm.updatedAt < cycleEnd
          ? vm.updatedAt
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
        payments: {
          where: {
            status: {
              in: ["paid", "admin_granted"],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        virtualMachines: {
          where: {
            status: { not: "DELETED" },
          },
          select: {
            status: true,
            cpu: true,
            ramMb: true,
            diskGb: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const latestSubscriptionPayment = user.payments[0] ?? null;
    const now = new Date();

    const planId = user.role === "ADMIN"
      ? SubscriptionPlanId.UNLIMITED
      : this.extractPlanFromPayment(latestSubscriptionPayment ?? { amount: 29, method: null })
        ?? this.resolvePlanFromQuota(user.quota);

    const cycleStartedAt = latestSubscriptionPayment?.createdAt ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleEndsAt = this.getBillingCycleEnd(cycleStartedAt);
    const vmHoursIncluded = SUBSCRIPTION_QUOTAS[planId].vmHoursMonthly;
    const vmHoursUsed = this.estimateVmHoursUsed(
      user.virtualMachines,
      cycleStartedAt,
      now < cycleEndsAt ? now : cycleEndsAt,
    );
    const vmHoursRemaining = planId === SubscriptionPlanId.UNLIMITED
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Number((vmHoursIncluded - vmHoursUsed).toFixed(2)));

    const cpuUsed = user.virtualMachines.reduce((acc, vm) => acc + vm.cpu, 0);
    const ramMbUsed = user.virtualMachines.reduce((acc, vm) => acc + vm.ramMb, 0);
    const diskGbUsed = user.virtualMachines.reduce((acc, vm) => acc + vm.diskGb, 0);

    const safeUser = this.excludePassword(user);

    return {
      ...safeUser,
      usage: {
        vmCount: user.virtualMachines.length,
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

    if (finalPlan !== SubscriptionPlanId.UNLIMITED) {
      const plan = SUBSCRIPTION_QUOTAS[finalPlan];
      await this.prisma.payment.create({
        data: {
          userId: id,
          amount: plan.monthlyPriceDt,
          currency: "TND",
          status: "admin_granted",
          method: `admin:grant:${finalPlan}`,
        },
      });
    }

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
        payments: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const paidPayments = user.payments.filter((p) => p.status === "paid");
    const totalSpent = paidPayments.reduce((acc, p) => acc + p.amount, 0);
    const lastPaid = paidPayments[0] ?? null;

    return {
      user: this.excludePassword(user),
      subscription:
        user.role === "ADMIN"
          ? SubscriptionPlanId.UNLIMITED
          : this.resolvePlanFromQuota(user.quota),
      totalSpent,
      paidPaymentsCount: paidPayments.length,
      pendingPaymentsCount: user.payments.filter((p) => p.status === "pending").length,
      lastPaid,
      recentPayments: user.payments,
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

    const [
      recentPayments,
      users,
      totalUsers,
      paidPayments,
      pendingPayments,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: userWhere,
        include: { quota: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
      this.prisma.payment.count({ where: { status: "paid" } }),
      this.prisma.payment.count({ where: { status: "pending" } }),
      this.prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
    ]);

    const usersWithSubscription = users.map((user) => ({
      ...this.excludePassword(user),
      subscription:
        user.role === "ADMIN"
          ? SubscriptionPlanId.UNLIMITED
          : this.resolvePlanFromQuota(user.quota),
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
