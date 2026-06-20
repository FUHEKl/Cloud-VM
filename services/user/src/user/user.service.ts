import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { CreateUniversityDto } from "./dto/create-university.dto";
import { UpdateUniversityDto } from "./dto/update-university.dto";
import {
  AdminSetSubscriptionDto,
  SubscriptionPlanId,
} from "./dto/admin-set-subscription.dto";
import * as bcrypt from "bcrypt";
import { EmailService } from "../common/email/email.service";

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

type SubscriptionPlanConfig = ManagedPlanConfig;

type PlanConfigRow = {
  planId: ManagedPlanId;
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
};

type ActivePlanId = SubscriptionPlanId | null;

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

const REQUIRED_PLAN_IDS: ManagedPlanId[] = [
  SubscriptionPlanId.STUDENT,
  SubscriptionPlanId.PRO,
  SubscriptionPlanId.ENTERPRISE,
];

const UNLIMITED_PLAN_CONFIG: SubscriptionPlanConfig = {
  maxVms: 9999,
  maxCpu: 9999,
  maxRamMb: 999999,
  maxDiskGb: 99999,
  monthlyPriceDt: 0,
  vmHoursMonthly: Number.MAX_SAFE_INTEGER,
  rank: 99,
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private buildPlanCatalogFromRows(rows: PlanConfigRow[]): Record<ManagedPlanId, SubscriptionPlanConfig> {
    const byId = new Map(rows.map((row) => [row.planId, row] as const));
    const missing = REQUIRED_PLAN_IDS.filter((planId) => !byId.has(planId));
    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `Missing plan configs for: ${missing.join(", ")}`,
      );
    }

    return REQUIRED_PLAN_IDS.reduce((acc, planId) => {
      const row = byId.get(planId)!;
      acc[planId] = {
        maxVms: row.maxVms,
        maxCpu: row.maxCpu,
        maxRamMb: row.maxRamMb,
        maxDiskGb: row.maxDiskGb,
        monthlyPriceDt: row.amountDt,
        vmHoursMonthly: row.vmHoursMonthly,
        rank: row.rank,
      };
      return acc;
    }, {} as Record<ManagedPlanId, SubscriptionPlanConfig>);
  }

  private isMissingPlanConfigTableError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2021",
    );
  }

  private async ensurePlanConfigTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "plan_configs" (
        "id" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "amountDt" DOUBLE PRECISION NOT NULL,
        "rank" INTEGER NOT NULL,
        "vmHoursMonthly" INTEGER NOT NULL,
        "maxVms" INTEGER NOT NULL,
        "maxCpu" INTEGER NOT NULL,
        "maxRamMb" INTEGER NOT NULL,
        "maxDiskGb" INTEGER NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
      );
    `);

    await this.prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX IF NOT EXISTS \"plan_configs_planId_key\" ON \"plan_configs\"(\"planId\");",
    );
  }

  private async getPlanCatalog(): Promise<Record<SubscriptionPlanId, SubscriptionPlanConfig>> {
    let rows: PlanConfigRow[] = [];
    try {
      rows = await this.prisma.planConfig.findMany({
        select: {
          planId: true,
          amountDt: true,
          rank: true,
          vmHoursMonthly: true,
          maxVms: true,
          maxCpu: true,
          maxRamMb: true,
          maxDiskGb: true,
        },
        orderBy: { rank: "asc" },
      }) as PlanConfigRow[];
    } catch (error) {
      if (!this.isMissingPlanConfigTableError(error)) {
        throw error;
      }
      await this.ensurePlanConfigTable();
      rows = await this.prisma.planConfig.findMany({
        select: {
          planId: true,
          amountDt: true,
          rank: true,
          vmHoursMonthly: true,
          maxVms: true,
          maxCpu: true,
          maxRamMb: true,
          maxDiskGb: true,
        },
        orderBy: { rank: "asc" },
      }) as PlanConfigRow[];
    }

    const buildCatalog = (source: PlanConfigRow[]) => ({
      ...this.buildPlanCatalogFromRows(source),
      [SubscriptionPlanId.UNLIMITED]: UNLIMITED_PLAN_CONFIG,
    });

    if (rows.length > 0) {
      return buildCatalog(rows as PlanConfigRow[]);
    }

    const seed = loadManagedSubscriptionCatalogFromEnv();
    await this.prisma.planConfig.createMany({
      data: REQUIRED_PLAN_IDS.map((planId) => ({
        planId,
        amountDt: seed[planId].monthlyPriceDt,
        rank: seed[planId].rank,
        vmHoursMonthly: seed[planId].vmHoursMonthly,
        maxVms: seed[planId].maxVms,
        maxCpu: seed[planId].maxCpu,
        maxRamMb: seed[planId].maxRamMb,
        maxDiskGb: seed[planId].maxDiskGb,
      })),
      skipDuplicates: true,
    });

    const seededRows = await this.prisma.planConfig.findMany({
      select: {
        planId: true,
        amountDt: true,
        rank: true,
        vmHoursMonthly: true,
        maxVms: true,
        maxCpu: true,
        maxRamMb: true,
        maxDiskGb: true,
      },
      orderBy: { rank: "asc" },
    });

    if (seededRows.length === 0) {
      throw new InternalServerErrorException("Plan catalog seed failed");
    }

    return buildCatalog(seededRows as PlanConfigRow[]);
  }

  private static readonly SAME_OR_LOWER_UNLOCK_USAGE_RATIO = 0.9;

  private normalizeUniversityDomain(domain: string): string {
    return domain.trim();
  }

  private validateUniversityDomain(domain: string) {
    if (!domain) {
      throw new BadRequestException("Email domain is required.");
    }

    if (domain !== domain.toLowerCase()) {
      throw new BadRequestException("Email domain must be lowercase.");
    }

    if (domain.includes(" ")) {
      throw new BadRequestException("Email domain must not contain spaces.");
    }

    if (!/^[@.][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new BadRequestException(
        "Email domain must start with @ or . and match the expected university format.",
      );
    }

    return domain;
  }

  private async assertAdminUser(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (admin?.role !== "ADMIN") {
      throw new ForbiddenException("Admin role required");
    }
  }

  // ── Student email verification ─────────────────────────────────────────────

  private async isStudentEmailAsync(email: string): Promise<boolean> {
    const lower = email.toLowerCase();
    const universities = await this.prisma.university.findMany({
      where: { isActive: true },
      select: { emailDomain: true },
    });

    return universities.some(({ emailDomain }) => lower.endsWith(emailDomain.toLowerCase()));
  }

  async requestStudentEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    if (!(await this.isStudentEmailAsync(user.email))) {
      throw new BadRequestException(
        "Your email address does not belong to a recognised student domain.",
      );
    }

    if (user.studentEmailVerified) {
      return { message: "Student email is already verified." };
    }

    // Generate a 6-digit code, hash it for storage
    const code = crypto.randomInt(100000, 1_000_000).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Delete any previous pending verifications for this user
    await this.prisma.studentEmailVerification.deleteMany({
      where: { userId },
    });

    await this.prisma.studentEmailVerification.create({
      data: { userId, email: user.email, codeHash, expiresAt },
    });

    await this.emailService.sendStudentVerificationCode(user.email, code);

    return { message: "Verification code sent to your email." };
  }

  async confirmStudentEmailVerification(userId: string, code: string) {
    if (!code || typeof code !== "string") {
      throw new BadRequestException("Verification code is required.");
    }

    const codeHash = crypto.createHash("sha256").update(code.trim()).digest("hex");

    const record = await this.prisma.studentEmailVerification.findFirst({
      where: { userId, codeHash },
    });

    if (!record) {
      throw new BadRequestException("Invalid verification code.");
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.studentEmailVerification.delete({ where: { id: record.id } });
      throw new BadRequestException("Verification code has expired. Please request a new one.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { studentEmailVerified: true, studentEmailVerifiedAt: new Date() },
    });

    await this.prisma.studentEmailVerification.deleteMany({ where: { userId } });

    return { message: "Student email verified successfully." };
  }

  async getStudentVerificationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { studentEmailVerified: true, studentEmailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException("User not found");
    return { verified: user.studentEmailVerified, verifiedAt: user.studentEmailVerifiedAt };
  }

  // ── End student email verification ────────────────────────────────────────

  async listUniversities(adminId: string) {
    await this.assertAdminUser(adminId);

    return this.prisma.university.findMany({
      orderBy: { name: "asc" },
    });
  }

  async createUniversity(dto: CreateUniversityDto, adminId: string) {
    await this.assertAdminUser(adminId);

    const name = dto.name.trim();
    const emailDomain = this.validateUniversityDomain(this.normalizeUniversityDomain(dto.emailDomain));

    const existing = await this.prisma.university.findFirst({
      where: {
        OR: [{ name }, { emailDomain }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("University name or email domain already exists.");
    }

    return this.prisma.university.create({
      data: {
        name,
        emailDomain,
        createdBy: adminId,
      },
    });
  }

  async updateUniversity(id: string, dto: UpdateUniversityDto, adminId: string) {
    await this.assertAdminUser(adminId);

    const university = await this.prisma.university.findUnique({ where: { id } });
    if (!university) {
      throw new NotFoundException("University not found");
    }

    const name = dto.name !== undefined ? dto.name.trim() : university.name;
    const emailDomain = dto.emailDomain !== undefined
      ? this.validateUniversityDomain(this.normalizeUniversityDomain(dto.emailDomain))
      : university.emailDomain;

    const duplicate = await this.prisma.university.findFirst({
      where: {
        id: { not: id },
        OR: [{ name }, { emailDomain }],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException("University name or email domain already exists.");
    }

    return this.prisma.university.update({
      where: { id },
      data: {
        name,
        emailDomain,
      },
    });
  }

  async deleteUniversity(id: string, adminId: string) {
    await this.assertAdminUser(adminId);

    const university = await this.prisma.university.findUnique({ where: { id } });
    if (!university) {
      throw new NotFoundException("University not found");
    }

    const verifiedStudent = await this.prisma.user.findFirst({
      where: {
        studentEmailVerified: true,
        email: {
          endsWith: university.emailDomain,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (verifiedStudent) {
      throw new ConflictException(
        "This university cannot be deleted because verified students still use this email domain.",
      );
    }

    await this.prisma.university.delete({ where: { id } });

    return { message: "University deleted successfully" };
  }

  async toggleUniversityActive(id: string, adminId: string) {
    await this.assertAdminUser(adminId);

    const university = await this.prisma.university.findUnique({ where: { id } });
    if (!university) {
      throw new NotFoundException("University not found");
    }

    return this.prisma.university.update({
      where: { id },
      data: { isActive: !university.isActive },
    });
  }

  async syncFromAuth(payload: {
    id: string;
    email: string;
    googleId?: string | null;
    firstName: string;
    lastName: string;
    role?: "USER" | "ADMIN";
    isActive?: boolean;
    mfaEnabled?: boolean;
    mfaEnabledAt?: string | null;
  }) {
    const role = payload.role === "ADMIN" ? "ADMIN" : "USER";

    const updateData: any = {
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role,
      isActive: payload.isActive ?? true,
      mfaEnabled: payload.mfaEnabled ?? false,
      mfaEnabledAt: payload.mfaEnabledAt ? new Date(payload.mfaEnabledAt) : null,
    };

    if (payload.googleId !== undefined) {
      updateData.googleId = payload.googleId;
    }

    const createData: any = {
      id: payload.id,
      email: payload.email,
      password: '',
      firstName: payload.firstName,
      lastName: payload.lastName,
      role,
      isActive: payload.isActive ?? true,
      mfaEnabled: payload.mfaEnabled ?? false,
      mfaEnabledAt: payload.mfaEnabledAt ? new Date(payload.mfaEnabledAt) : null,
    };

    if (payload.googleId) {
      createData.googleId = payload.googleId;
    }

    const user = await this.prisma.user.upsert({
      where: { id: payload.id },
      update: updateData,
      create: createData,
    });

    // Keep user quotas immutable on auth sync to avoid resetting paid plans.
    // New USER accounts start with no active paid subscription.
    if (role === "ADMIN") {
      await this.upsertQuota(user.id, SubscriptionPlanId.UNLIMITED);
    }

    return user;
  }

  private static readonly UNLIMITED_QUOTA = {
    maxVms: UNLIMITED_PLAN_CONFIG.maxVms,
    maxCpu: UNLIMITED_PLAN_CONFIG.maxCpu,
    maxRamMb: UNLIMITED_PLAN_CONFIG.maxRamMb,
    maxDiskGb: UNLIMITED_PLAN_CONFIG.maxDiskGb,
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

  private resolvePlanFromQuota(
    quota: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  } | null,
    catalog: Record<SubscriptionPlanId, SubscriptionPlanConfig>,
  ): ActivePlanId {
    if (!quota) return null;

    if (
      quota.maxVms >= catalog[SubscriptionPlanId.UNLIMITED].maxVms ||
      quota.maxCpu >= catalog[SubscriptionPlanId.UNLIMITED].maxCpu
    ) {
      return SubscriptionPlanId.UNLIMITED;
    }

    if (
      quota.maxVms >= catalog[SubscriptionPlanId.ENTERPRISE].maxVms &&
      quota.maxCpu >= catalog[SubscriptionPlanId.ENTERPRISE].maxCpu
    ) {
      return SubscriptionPlanId.ENTERPRISE;
    }

    if (
      quota.maxVms >= catalog[SubscriptionPlanId.PRO].maxVms &&
      quota.maxCpu >= catalog[SubscriptionPlanId.PRO].maxCpu
    ) {
      return SubscriptionPlanId.PRO;
    }

    if (
      quota.maxVms >= catalog[SubscriptionPlanId.STUDENT].maxVms &&
      quota.maxCpu >= catalog[SubscriptionPlanId.STUDENT].maxCpu
    ) {
      return SubscriptionPlanId.STUDENT;
    }

    return null;
  }

  private async upsertQuota(userId: string, planId: SubscriptionPlanId) {
    const catalog = await this.getPlanCatalog();
    const quota = catalog[planId];
    return this.prisma.userQuota.upsert({
      where: { userId },
      update: {
        maxVms: quota.maxVms,
        maxCpu: quota.maxCpu,
        maxRamMb: quota.maxRamMb,
        maxDiskGb: quota.maxDiskGb,
        planId,
      },
      create: {
        userId,
        maxVms: quota.maxVms,
        maxCpu: quota.maxCpu,
        maxRamMb: quota.maxRamMb,
        maxDiskGb: quota.maxDiskGb,
        planId,
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
  }, catalog: Record<SubscriptionPlanId, SubscriptionPlanConfig>): ActivePlanId {
    if (args.role === "ADMIN") {
      return SubscriptionPlanId.UNLIMITED;
    }

    return this.resolvePlanFromQuota(args.quota ?? null, catalog);
  }

  private getBillingCycleEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  private extractPlanFromPayment(payment: {
    planId?: string | null;
    method?: string | null;
  }): ActivePlanId {
    if (
      payment.planId === SubscriptionPlanId.STUDENT ||
      payment.planId === SubscriptionPlanId.PRO ||
      payment.planId === SubscriptionPlanId.ENTERPRISE ||
      payment.planId === SubscriptionPlanId.UNLIMITED
    ) {
      return payment.planId;
    }

    const method = (payment.method || "").toLowerCase();

    if (method.startsWith("admin:grant:")) {
      const candidate = method.split(":")[2] as ActivePlanId | undefined;
      if (
        candidate === SubscriptionPlanId.STUDENT ||
        candidate === SubscriptionPlanId.PRO ||
        candidate === SubscriptionPlanId.ENTERPRISE ||
        candidate === SubscriptionPlanId.UNLIMITED
      ) {
        return candidate;
      }
    }

    const planMatch = method.match(/:plan:(student|pro|enterprise|unlimited)/i);
    if (planMatch?.[1]) {
      return planMatch[1] as ActivePlanId;
    }

    return null;
  }

  private isFullPricePayment(
    payment: {
    amount: number;
    planId?: string | null;
    method?: string | null;
  },
    catalog: Record<SubscriptionPlanId, SubscriptionPlanConfig>,
  ): boolean {
    const planId = this.extractPlanFromPayment(payment);
    if (!planId) return false;
    if (planId === SubscriptionPlanId.UNLIMITED) return true;

    const plan = catalog[planId];
    if (!plan) return false;

    return payment.amount >= Number((plan.monthlyPriceDt - 0.01).toFixed(2));
  }

  private async getLatestBillingCycleStart(userId: string): Promise<Date | null> {
    const payments = await this.prisma.payment.findMany({
      where: {
        userId,
        status: { in: ["paid", "admin_granted"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        amount: true,
        planId: true,
        method: true,
        createdAt: true,
      },
    });

    if (payments.length === 0) {
      return null;
    }

    const catalog = await this.getPlanCatalog();
    const fullPayment = payments.find((payment) => this.isFullPricePayment(payment, catalog));
    return (fullPayment ?? payments[0]).createdAt;
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
    // ✅ FIX: compute cycle dates once up-front so all 3 queries fire in parallel
    const now = new Date();

    // ✅ FIX: all 3 DB queries run simultaneously instead of sequentially
    const [user, resourceUsage, vmsForHours, cycleStartOverride] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { quota: true },
      }),
      this.prisma.virtualMachine.aggregate({
        where: { userId, status: { not: "DELETED" as any } },
        _sum: { cpu: true, ramMb: true, diskGb: true },
        _count: { id: true },
      }),
      this.prisma.virtualMachine.findMany({
        where: {
          userId,
        },
        select: { status: true, createdAt: true, stoppedAt: true },
      }),
      this.getLatestBillingCycleStart(userId),
    ]);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const catalog = await this.getPlanCatalog();
    const planId = this.resolvePlanForUser({
      role: user.role,
      quota: user.quota,
    }, catalog);

    let subscription: {
      planId: SubscriptionPlanId;
      cycleStartedAt: Date;
      cycleEndsAt: Date;
      vmHoursIncluded: number;
      vmHoursUsed: number;
      vmHoursRemaining: number;
      canRenewSamePlan: boolean;
    } | null = null;

    if (planId) {
      const cycleStartedAt = cycleStartOverride ?? user.createdAt;
      const cycleEndsAt = this.getBillingCycleEnd(cycleStartedAt);
      const vmHoursIncluded = catalog[planId].vmHoursMonthly;

      const vmHoursUsed = this.estimateVmHoursUsed(
        vmsForHours,
        cycleStartedAt,
        now < cycleEndsAt ? now : cycleEndsAt,
      );

      const vmHoursRemaining = planId === SubscriptionPlanId.UNLIMITED
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, Number((vmHoursIncluded - vmHoursUsed).toFixed(2)));

      const sameOrLowerUnlockedByUsage =
        planId !== SubscriptionPlanId.UNLIMITED &&
        vmHoursIncluded > 0 &&
        vmHoursUsed >= vmHoursIncluded * UserService.SAME_OR_LOWER_UNLOCK_USAGE_RATIO;

      subscription = {
        planId,
        cycleStartedAt,
        cycleEndsAt,
        vmHoursIncluded,
        vmHoursUsed,
        vmHoursRemaining,
        canRenewSamePlan:
          planId === SubscriptionPlanId.UNLIMITED
            ? false
            : now >= cycleEndsAt || sameOrLowerUnlockedByUsage,
      };
    }

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
      subscription,
    };
  }

  async getProfileSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const now = new Date();

    const catalog = await this.getPlanCatalog();
    const planId = this.resolvePlanForUser({
      role: user.role,
      quota: user.quota,
    }, catalog);

    let subscription: {
      planId: SubscriptionPlanId;
      cycleStartedAt: Date;
      cycleEndsAt: Date;
      vmHoursIncluded: number;
      vmHoursUsed: number;
      vmHoursRemaining: number;
      canRenewSamePlan: boolean;
    } | null = null;

    if (planId) {
      const cycleStartedAt = (await this.getLatestBillingCycleStart(userId)) ?? user.createdAt;
      const cycleEndsAt = this.getBillingCycleEnd(cycleStartedAt);
      const vmHoursIncluded = catalog[planId].vmHoursMonthly;

      const vmsForHours = await this.prisma.virtualMachine.findMany({
        where: {
          userId,
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

      const sameOrLowerUnlockedByUsage =
        planId !== SubscriptionPlanId.UNLIMITED &&
        vmHoursIncluded > 0 &&
        vmHoursUsed >= vmHoursIncluded * UserService.SAME_OR_LOWER_UNLOCK_USAGE_RATIO;

      subscription = {
        planId,
        cycleStartedAt,
        cycleEndsAt,
        vmHoursIncluded,
        vmHoursUsed,
        vmHoursRemaining,
        canRenewSamePlan:
          planId === SubscriptionPlanId.UNLIMITED
            ? false
            : now >= cycleEndsAt || sameOrLowerUnlockedByUsage,
      };
    }

    const safeUser = this.excludePassword(user);
    const effectiveQuota = user.role === "ADMIN"
      ? UserService.UNLIMITED_QUOTA
      : user.quota;

    return {
      ...safeUser,
      quota: effectiveQuota,
      subscription,
    };
  }

  async getInternalSubscriptionAccess(userId: string) {
    const profile = await this.getProfile(userId);
    const subscription = profile.subscription;

    if (!subscription) {
      return {
        activePlanId: null,
        canPurchaseSameOrLower: true,
        usageRatio: 0,
      };
    }

    if (subscription.planId === SubscriptionPlanId.UNLIMITED) {
      return {
        activePlanId: SubscriptionPlanId.UNLIMITED,
        canPurchaseSameOrLower: false,
        usageRatio: 1,
      };
    }

    const usageRatio = subscription.vmHoursIncluded > 0
      ? Number((subscription.vmHoursUsed / subscription.vmHoursIncluded).toFixed(4))
      : 0;

    return {
      activePlanId: subscription.planId,
      canPurchaseSameOrLower: subscription.canRenewSamePlan,
      usageRatio,
      cycleEndsAt: subscription.cycleEndsAt,
      vmHoursUsed: subscription.vmHoursUsed,
      vmHoursIncluded: subscription.vmHoursIncluded,
    };
  }

  async getInternalQuotaSnapshot(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        quota: {
          select: {
            maxVms: true,
            maxCpu: true,
            maxRamMb: true,
            maxDiskGb: true,
            planId: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.role === "ADMIN") {
      return {
        hasActiveSubscription: true,
        planId: SubscriptionPlanId.UNLIMITED,
        quota: {
          ...UserService.UNLIMITED_QUOTA,
        },
      };
    }

    if (!user.quota) {
      return {
        hasActiveSubscription: false,
        planId: null,
        quota: null,
      };
    }

    return {
      hasActiveSubscription: user.quota.planId !== null,
      planId: user.quota.planId,
      quota: {
        maxVms: user.quota.maxVms,
        maxCpu: user.quota.maxCpu,
        maxRamMb: user.quota.maxRamMb,
        maxDiskGb: user.quota.maxDiskGb,
      },
    };
  }

  async activateSubscriptionPlanFromInternal(
    userId: string,
    planId: "student" | "pro" | "enterprise" | "unlimited",
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const finalPlan = user.role === "ADMIN"
      ? SubscriptionPlanId.UNLIMITED
      : (planId as SubscriptionPlanId);

    const quota = await this.upsertQuota(userId, finalPlan);

    return {
      userId,
      planId: finalPlan,
      quota,
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

    const catalog = await this.getPlanCatalog();

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
      }, catalog),
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

    const catalog = await this.getPlanCatalog();

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
      }, catalog),
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