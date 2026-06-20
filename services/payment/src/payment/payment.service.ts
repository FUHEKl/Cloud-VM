import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  NotFoundException,
} from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";

type PlanId = "student" | "pro" | "enterprise";
type AnyPlanId = PlanId | "unlimited";

type ManagedPlanConfig = {
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  quota: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  };
};

type PaymentPlanConfig = ManagedPlanConfig & {
  name: string;
  description: string;
  amountMilli: number;
};

type PublicPlan = {
  id: PlanId;
  name: string;
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  quota: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  };
  features: string[];
};

type SubscriptionAccessSnapshot = {
  activePlanId: AnyPlanId | null;
  canPurchaseSameOrLower: boolean;
  usageRatio: number;
  cycleEndsAt?: string;
  vmHoursUsed?: number;
  vmHoursIncluded?: number;
};

const PLAN_LABELS: Record<PlanId, string> = {
  student: "Student",
  pro: "Pro",
  enterprise: "Enterprise",
};

const REQUIRED_PLAN_IDS: PlanId[] = ["student", "pro", "enterprise"];

type PlanConfigRow = {
  planId: PlanId;
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
};

function loadManagedPlanCatalogFromEnv(): Record<PlanId, ManagedPlanConfig> {
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

  const record = parsed as Record<string, ManagedPlanConfig>;
  const requiredPlans: PlanId[] = ["student", "pro", "enterprise"];

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
    student: record.student,
    pro: record.pro,
    enterprise: record.enterprise,
  };
}

@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly stripe: Stripe | null;
  private planCatalog: Record<PlanId, PaymentPlanConfig> | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key
      ? new Stripe(key, {
          apiVersion: "2024-06-20",
        })
      : null;
  }

  async onModuleInit() {
    this.planCatalog = await this.loadPlanCatalog();
  }

  private assertAdminRole(actorRole?: string) {
    if (actorRole !== "ADMIN") {
      throw new ForbiddenException("Admin role required");
    }
  }

  private assertPlanId(planId: string): PlanId {
    if (planId === "student" || planId === "pro" || planId === "enterprise") {
      return planId;
    }
    throw new BadRequestException("Invalid plan id");
  }

  private buildPaymentPlanConfig(planId: PlanId, raw: PlanConfigRow): PaymentPlanConfig {
    return {
      amountDt: raw.amountDt,
      rank: raw.rank,
      vmHoursMonthly: raw.vmHoursMonthly,
      quota: {
        maxVms: raw.maxVms,
        maxCpu: raw.maxCpu,
        maxRamMb: raw.maxRamMb,
        maxDiskGb: raw.maxDiskGb,
      },
      name: `${PLAN_LABELS[planId]} Plan`,
      amountMilli: Math.round(raw.amountDt * 1000),
      description: `Up to ${raw.maxVms} VMs · ${raw.vmHoursMonthly} VM hours/month · ${raw.maxCpu} vCPU / ${Math.round(raw.maxRamMb / 1024)} GB / ${raw.maxDiskGb} GB`,
    };
  }

  private toPublicPlan(planId: PlanId, raw: PlanConfigRow): PublicPlan {
    return {
      id: planId,
      name: PLAN_LABELS[planId],
      amountDt: raw.amountDt,
      rank: raw.rank,
      vmHoursMonthly: raw.vmHoursMonthly,
      quota: {
        maxVms: raw.maxVms,
        maxCpu: raw.maxCpu,
        maxRamMb: raw.maxRamMb,
        maxDiskGb: raw.maxDiskGb,
      },
      features: [
        `${raw.maxVms} VMs`,
        `${raw.vmHoursMonthly} VM hours/month`,
        `${raw.maxCpu} vCPU · ${Math.round(raw.maxRamMb / 1024)} GB RAM · ${raw.maxDiskGb} GB disk`,
      ],
    };
  }

  private buildPlanCatalogFromRows(rows: PlanConfigRow[]): Record<PlanId, PaymentPlanConfig> {
    const byId = new Map(rows.map((row) => [row.planId, row] as const));
    const missing = REQUIRED_PLAN_IDS.filter((planId) => !byId.has(planId));
    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `Missing plan configs for: ${missing.join(", ")}`,
      );
    }

    return REQUIRED_PLAN_IDS.reduce((acc, planId) => {
      const row = byId.get(planId)!;
      acc[planId] = this.buildPaymentPlanConfig(planId, row);
      return acc;
    }, {} as Record<PlanId, PaymentPlanConfig>);
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

  private async loadPlanCatalog(): Promise<Record<PlanId, PaymentPlanConfig>> {
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

    if (rows.length > 0) {
      return this.buildPlanCatalogFromRows(rows as PlanConfigRow[]);
    }

    const seed = loadManagedPlanCatalogFromEnv();
    await this.prisma.planConfig.createMany({
      data: REQUIRED_PLAN_IDS.map((planId) => ({
        planId,
        amountDt: seed[planId].amountDt,
        rank: seed[planId].rank,
        vmHoursMonthly: seed[planId].vmHoursMonthly,
        maxVms: seed[planId].quota.maxVms,
        maxCpu: seed[planId].quota.maxCpu,
        maxRamMb: seed[planId].quota.maxRamMb,
        maxDiskGb: seed[planId].quota.maxDiskGb,
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

    return this.buildPlanCatalogFromRows(seededRows as PlanConfigRow[]);
  }

  private async getPlanCatalog(): Promise<Record<PlanId, PaymentPlanConfig>> {
    if (!this.planCatalog) {
      this.planCatalog = await this.loadPlanCatalog();
    }
    return this.planCatalog;
  }

  private async refreshPlanCatalog() {
    this.planCatalog = await this.loadPlanCatalog();
  }

  private getPublicOrigin(): string {
    const fromEnv = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (fromEnv) return fromEnv;

    const firstCors = (process.env.CORS_ORIGIN || "http://127.0.0.1:3000")
      .split(",")
      .map((v: string) => v.trim())
      .filter(Boolean)[0];

    return firstCors || "http://127.0.0.1:3000";
  }

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

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const detail = body.replace(/\s+/g, " ").slice(0, 300);
        throw new InternalServerErrorException(
          detail ? `${errorMessage}: ${detail}` : errorMessage,
        );
      }

      return response;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(errorMessage);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getSubscriptionAccessSnapshot(userId: string): Promise<SubscriptionAccessSnapshot> {
    const url = `${this.getUserServiceUrl()}/users/internal/subscription-access/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await this.fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { "x-sync-token": syncToken },
      },
      "Failed to verify subscription access state",
    );

    return (await response.json()) as SubscriptionAccessSnapshot;
  }

  private getUsdPerTndRate(): number {
    const raw = (process.env.STRIPE_TND_TO_USD_RATE || "0.32").trim();
    const rate = Number(raw);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new InternalServerErrorException("Invalid STRIPE_TND_TO_USD_RATE configuration");
    }

    return rate;
  }

  private extractPlanFromPayment(payment: {
    planId?: string | null;
    method?: string | null;
    amount: number;
  }): AnyPlanId | null {
    if (payment.planId === "student" || payment.planId === "pro" || payment.planId === "enterprise" || payment.planId === "unlimited") {
      return payment.planId;
    }

    // Backward compatibility for legacy rows created before planId column.
    const method = (payment.method || "").toLowerCase();

    if (method.startsWith("admin:grant:")) {
      const candidate = method.split(":")[2] as AnyPlanId | undefined;
      if (candidate === "student" || candidate === "pro" || candidate === "enterprise" || candidate === "unlimited") {
        return candidate;
      }
    }

    const planMatch = method.match(/:plan:(student|pro|enterprise|unlimited)/);
    if (planMatch?.[1]) {
      return planMatch[1] as AnyPlanId;
    }

    return null;
  }

  private getPlanRank(
    planId: AnyPlanId | null,
    catalog: Record<PlanId, PaymentPlanConfig>,
  ): number {
    if (!planId) return 0;
    if (planId === "unlimited") return 99;
    return catalog[planId].rank;
  }

  private getBillingCycleEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }


  private async syncQuotaForPlan(userId: string, planId: AnyPlanId | null) {
    if (!planId) return;

    const url = `${this.getUserServiceUrl()}/users/internal/subscription-activate`;
    const syncToken = this.getInterServiceSyncToken();

    await this.fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sync-token": syncToken,
        },
        body: JSON.stringify({ userId, planId }),
      },
      "Failed to activate subscription quota",
    );
  }

  private async getStudentVerification(userId: string): Promise<{ verified: boolean }> {
    const url = `${this.getUserServiceUrl()}/users/internal/student-verification/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await this.fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { "x-sync-token": syncToken },
      },
      "Failed to fetch student verification status",
    );

    return response.json() as Promise<{ verified: boolean }>;
  }

  private async enforcePlanPurchaseRules(
    userId: string,
    requestedPlanId: PlanId,
    catalog: Record<PlanId, PaymentPlanConfig>,
  ) {
    const snapshot = await this.getSubscriptionAccessSnapshot(userId);

    const currentPlanId = snapshot.activePlanId;
    if (!currentPlanId) return;
    if (currentPlanId === "unlimited") {
      throw new ForbiddenException("Admin/unlimited accounts cannot purchase paid plans");
    }

    const currentRank = this.getPlanRank(currentPlanId, catalog);
    const requestedRank = this.getPlanRank(requestedPlanId, catalog);

    if (requestedRank > currentRank) return;

    if (snapshot.canPurchaseSameOrLower) return;

    const usagePct = Math.round((snapshot.usageRatio || 0) * 100);
    const cycleEndText = snapshot.cycleEndsAt
      ? new Date(snapshot.cycleEndsAt).toLocaleDateString("en-US")
      : "the current cycle end";

    if (requestedPlanId === currentPlanId) {
      throw new BadRequestException(
        `You already have the ${currentPlanId} plan. Renewal is locked until you reach 90% usage or until ${cycleEndText}. Current usage: ${usagePct}%.`,
      );
    }

    throw new BadRequestException(
      `You currently have an active ${currentPlanId} plan. Same or lower plans unlock at 90% usage (or cycle end). Current usage: ${usagePct}%.`,
    );
  }

  private async markStripeSessionAsPaid(sessionId: string, expectedUserId?: string) {
    const matched = await this.prisma.payment.findMany({
      where: {
        method: { startsWith: `stripe:${sessionId}` },
      },
      select: { id: true, userId: true, planId: true, method: true, amount: true, status: true },
    });

    if (matched.length === 0) {
      return { updated: 0 as number, appliedPlanIds: [] as AnyPlanId[] };
    }

    if (expectedUserId && matched.some((payment) => payment.userId !== expectedUserId)) {
      throw new ForbiddenException("Checkout session does not belong to this account");
    }

    await this.prisma.payment.updateMany({
      where: {
        id: { in: matched.map((payment) => payment.id) },
        status: { notIn: ["paid", "admin_granted"] },
      },
      data: { status: "paid" },
    });

    const appliedPlanIds: AnyPlanId[] = [];
    for (const payment of matched) {
      const planId = this.extractPlanFromPayment(payment);
      if (planId) {
        appliedPlanIds.push(planId);
      }
      await this.syncQuotaForPlan(payment.userId, planId);
    }

    return { updated: matched.length, appliedPlanIds };
  }

  async createCheckoutSession(userId: string, role: string, planId: PlanId) {
    if (!this.stripe) {
      throw new InternalServerErrorException("Stripe is not configured on this environment");
    }

    if (role === "ADMIN") {
      throw new ForbiddenException("Admin accounts have unlimited access and cannot purchase plans");
    }

    const planCatalog = await this.getPlanCatalog();
    const plan = planCatalog[planId];
    if (!plan) {
      throw new BadRequestException("Invalid plan id");
    }

    if (planId === "student") {
      const verification = await this.getStudentVerification(userId);
      if (!verification.verified) {
        throw new ForbiddenException("Student email verification is required before purchasing the Student plan.");
      }
    }

    await this.enforcePlanPurchaseRules(userId, planId, planCatalog);

    const snapshot = await this.getSubscriptionAccessSnapshot(userId);
    const rawPlanId = snapshot.activePlanId;
    const currentPlanId = rawPlanId === "unlimited" ? null : rawPlanId;
    const requestedRank = this.getPlanRank(planId, planCatalog);
    const currentRank = this.getPlanRank(currentPlanId, planCatalog);
    const isUpgrade = Boolean(currentPlanId) && requestedRank > currentRank;

    const currentPlanAmount = isUpgrade && currentPlanId
      ? planCatalog[currentPlanId].amountDt
      : 0;
    const chargeDt = isUpgrade
      ? Math.max(0, Number((plan.amountDt - currentPlanAmount).toFixed(2)))
      : plan.amountDt;

    const origin = this.getPublicOrigin();
    const usdPerTndRate = this.getUsdPerTndRate();
    const usdAmount = Number((chargeDt * usdPerTndRate).toFixed(2));
    const usdCents = Math.round(usdAmount * 100);

    const productName = isUpgrade
      ? `Upgrade to ${PLAN_LABELS[planId]}`
      : plan.name;

    const productDescription = isUpgrade && currentPlanId
      ? `${plan.description} · Upgrade from ${PLAN_LABELS[currentPlanId]} · Displayed price: ${chargeDt} DT`
      : `${plan.description} · Displayed price: ${plan.amountDt} DT`;

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: usdCents,
            product_data: {
              name: productName,
              description: productDescription,
            },
          },
        },
      ],
      metadata: {
        userId,
        planId,
        amountTnd: String(chargeDt),
        usdPerTndRate: String(usdPerTndRate),
        chargedUsd: String(usdAmount),
        ...(isUpgrade && currentPlanId
          ? { upgrade_from: currentPlanId }
          : {}),
      },
      success_url: `${origin}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
    });

    await this.prisma.payment.create({
      data: {
        userId,
        planId,
        amount: chargeDt,
        currency: "TND",
        status: "pending",
        method: `stripe:${session.id}:plan:${planId}:usd:${usdAmount.toFixed(2)}`,
      },
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      amountDt: chargeDt,
      currency: "TND",
      chargedCurrency: "USD",
      chargedAmount: usdAmount,
      usdPerTndRate,
    };
  }

  async listPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPublicPlans(): Promise<PublicPlan[]> {
    const planCatalog = await this.getPlanCatalog();
    return (Object.keys(planCatalog) as PlanId[])
      .map((planId) => {
        const plan = planCatalog[planId];
        return {
          id: planId,
          name: PLAN_LABELS[planId],
          amountDt: plan.amountDt,
          rank: plan.rank,
          vmHoursMonthly: plan.vmHoursMonthly,
          quota: { ...plan.quota },
          features: [
            `${plan.quota.maxVms} VMs`,
            `${plan.vmHoursMonthly} VM hours/month`,
            `${plan.quota.maxCpu} vCPU · ${Math.round(plan.quota.maxRamMb / 1024)} GB RAM · ${plan.quota.maxDiskGb} GB disk`,
          ],
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }

  async adminGetAllPlans(actorRole?: string) {
    this.assertAdminRole(actorRole);
    await this.getPlanCatalog();
    const rows = await this.prisma.planConfig.findMany({
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

    return rows
      .filter((row) => REQUIRED_PLAN_IDS.includes(row.planId as PlanId))
      .map((row) => this.toPublicPlan(row.planId as PlanId, row as PlanConfigRow));
  }

  async adminUpdatePlan(
    actorRole: string | undefined,
    planId: string,
    payload: Partial<PlanConfigRow>,
  ) {
    this.assertAdminRole(actorRole);
    const normalizedId = this.assertPlanId(planId);

    const existing = await this.prisma.planConfig.findUnique({
      where: { planId: normalizedId },
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
    });

    if (!existing) {
      throw new NotFoundException("Plan config not found");
    }

    if (!payload || Object.keys(payload).length === 0) {
      return existing;
    }

    const updated = await this.prisma.planConfig.update({
      where: { planId: normalizedId },
      data: payload,
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
    });

    await this.refreshPlanCatalog();

    return updated;
  }

  async confirmCheckoutSession(userId: string, sessionId: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException("Stripe is not configured on this environment");
    }

    if (!sessionId?.trim()) {
      throw new BadRequestException("Missing Stripe session id");
    }

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      throw new BadRequestException("Stripe session not found");
    }

    if (session.metadata?.userId && session.metadata.userId !== userId) {
      throw new ForbiddenException("Checkout session does not belong to this account");
    }

    if (session.payment_status !== "paid") {
      throw new BadRequestException("Stripe session is not paid yet");
    }

    const result = await this.markStripeSessionAsPaid(sessionId, userId);

    return {
      ok: true,
      sessionId,
      status: "paid",
      updatedPayments: result.updated,
      appliedPlanIds: result.appliedPlanIds,
    };
  }

  async handleWebhook(rawBody: Buffer, stripeSignature?: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException("Stripe is not configured on this environment");
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new InternalServerErrorException("Missing STRIPE_WEBHOOK_SECRET");
    }

    if (!stripeSignature) {
      throw new BadRequestException("Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
    } catch {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type,
        },
      });
    } catch (error) {
      const prismaCode = (error as { code?: string })?.code;
      if (prismaCode === "P2002") {
        // Stripe retries can deliver the same event multiple times.
        return;
      }
      throw error;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.markStripeSessionAsPaid(session.id);
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.prisma.payment.updateMany({
        where: {
          method: { startsWith: `stripe:${session.id}` },
          status: "pending",
        },
        data: { status: "expired" },
      });
    }
  }
}