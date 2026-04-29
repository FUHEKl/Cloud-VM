import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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

const MANAGED_PLAN_CATALOG = loadManagedPlanCatalogFromEnv();

const PLAN_CATALOG: Record<PlanId, PaymentPlanConfig> = {
  student: {
    ...MANAGED_PLAN_CATALOG.student,
    name: `${PLAN_LABELS.student} Plan`,
    amountMilli: Math.round(MANAGED_PLAN_CATALOG.student.amountDt * 1000),
    description: `Up to ${MANAGED_PLAN_CATALOG.student.quota.maxVms} VMs · ${MANAGED_PLAN_CATALOG.student.vmHoursMonthly} VM hours/month · ${MANAGED_PLAN_CATALOG.student.quota.maxCpu} vCPU / ${Math.round(MANAGED_PLAN_CATALOG.student.quota.maxRamMb / 1024)} GB / ${MANAGED_PLAN_CATALOG.student.quota.maxDiskGb} GB`,
  },
  pro: {
    ...MANAGED_PLAN_CATALOG.pro,
    name: `${PLAN_LABELS.pro} Plan`,
    amountMilli: Math.round(MANAGED_PLAN_CATALOG.pro.amountDt * 1000),
    description: `Up to ${MANAGED_PLAN_CATALOG.pro.quota.maxVms} VMs · ${MANAGED_PLAN_CATALOG.pro.vmHoursMonthly} VM hours/month · ${MANAGED_PLAN_CATALOG.pro.quota.maxCpu} vCPU / ${Math.round(MANAGED_PLAN_CATALOG.pro.quota.maxRamMb / 1024)} GB / ${MANAGED_PLAN_CATALOG.pro.quota.maxDiskGb} GB`,
  },
  enterprise: {
    ...MANAGED_PLAN_CATALOG.enterprise,
    name: `${PLAN_LABELS.enterprise} Plan`,
    amountMilli: Math.round(MANAGED_PLAN_CATALOG.enterprise.amountDt * 1000),
    description: `Up to ${MANAGED_PLAN_CATALOG.enterprise.quota.maxVms} VMs · ${MANAGED_PLAN_CATALOG.enterprise.vmHoursMonthly} VM hours/month · ${MANAGED_PLAN_CATALOG.enterprise.quota.maxCpu} vCPU / ${Math.round(MANAGED_PLAN_CATALOG.enterprise.quota.maxRamMb / 1024)} GB / ${MANAGED_PLAN_CATALOG.enterprise.quota.maxDiskGb} GB`,
  },
};

@Injectable()
export class PaymentService {
  private readonly stripe: Stripe | null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key
      ? new Stripe(key, {
          apiVersion: "2024-06-20",
        })
      : null;
  }

  private getPublicOrigin(): string {
    const fromEnv = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (fromEnv) return fromEnv;

    const firstCors = (process.env.CORS_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((v: string) => v.trim())
      .filter(Boolean)[0];

    return firstCors || "http://localhost:3000";
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

  private async getSubscriptionAccessSnapshot(userId: string): Promise<SubscriptionAccessSnapshot> {
    const url = `${this.getUserServiceUrl()}/users/internal/subscription-access/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-sync-token": syncToken,
      },
    });

    if (!response.ok) {
      throw new InternalServerErrorException("Failed to verify subscription access state");
    }

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

  private getPlanRank(planId: AnyPlanId | null): number {
    if (!planId) return 0;
    if (planId === "unlimited") return 99;
    return PLAN_CATALOG[planId].rank;
  }

  private getBillingCycleEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }


  private async syncQuotaForPlan(userId: string, planId: AnyPlanId | null) {
    if (!planId) return;

    const url = `${this.getUserServiceUrl()}/users/internal/subscription-activate`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sync-token": syncToken,
      },
      body: JSON.stringify({ userId, planId }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException("Failed to activate subscription quota");
    }
  }

  private async getStudentVerification(userId: string): Promise<{ verified: boolean }> {
    const url = `${this.getUserServiceUrl()}/users/internal/student-verification/${encodeURIComponent(userId)}`;
    const syncToken = this.getInterServiceSyncToken();

    const response = await fetch(url, {
      method: "GET",
      headers: { "x-sync-token": syncToken },
    });

    if (!response.ok) {
      throw new InternalServerErrorException("Failed to fetch student verification status");
    }

    return response.json() as Promise<{ verified: boolean }>;
  }

  private async enforcePlanPurchaseRules(userId: string, requestedPlanId: PlanId) {
    const snapshot = await this.getSubscriptionAccessSnapshot(userId);

    const currentPlanId = snapshot.activePlanId;
    if (!currentPlanId) return;
    if (currentPlanId === "unlimited") {
      throw new ForbiddenException("Admin/unlimited accounts cannot purchase paid plans");
    }

    const currentRank = this.getPlanRank(currentPlanId);
    const requestedRank = this.getPlanRank(requestedPlanId);

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

    const plan = PLAN_CATALOG[planId];
    if (!plan) {
      throw new BadRequestException("Invalid plan id");
    }

    if (planId === "student") {
      const verification = await this.getStudentVerification(userId);
      if (!verification.verified) {
        throw new ForbiddenException("Student email verification is required before purchasing the Student plan.");
      }
    }

    await this.enforcePlanPurchaseRules(userId, planId);

    const origin = this.getPublicOrigin();
    const usdPerTndRate = this.getUsdPerTndRate();
    const usdAmount = Number((plan.amountDt * usdPerTndRate).toFixed(2));
    const usdCents = Math.round(usdAmount * 100);

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
              name: plan.name,
              description: `${plan.description} · Displayed price: ${plan.amountDt} DT`,
            },
          },
        },
      ],
      metadata: {
        userId,
        planId,
        amountTnd: String(plan.amountDt),
        usdPerTndRate: String(usdPerTndRate),
        chargedUsd: String(usdAmount),
      },
      success_url: `${origin}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
    });

    await this.prisma.payment.create({
      data: {
        userId,
        planId,
        amount: plan.amountDt,
        currency: "TND",
        status: "pending",
        method: `stripe:${session.id}:plan:${planId}:usd:${usdAmount.toFixed(2)}`,
      },
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      amountDt: plan.amountDt,
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

  getPublicPlans(): PublicPlan[] {
    return (Object.keys(PLAN_CATALOG) as PlanId[])
      .map((planId) => {
        const plan = PLAN_CATALOG[planId];
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