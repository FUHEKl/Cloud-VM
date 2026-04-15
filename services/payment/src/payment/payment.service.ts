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

const UNLIMITED_QUOTA = {
  maxVms: 9999,
  maxCpu: 9999,
  maxRamMb: 999999,
  maxDiskGb: 99999,
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

    const quota = planId === "unlimited" ? UNLIMITED_QUOTA : PLAN_CATALOG[planId].quota;
    await this.prisma.userQuota.upsert({
      where: { userId },
      update: quota,
      create: {
        userId,
        ...quota,
      },
    });
  }

  private async enforcePlanPurchaseRules(userId: string, requestedPlanId: PlanId) {
    const latestSubscription = await this.prisma.payment.findFirst({
      where: {
        userId,
        status: {
          in: ["paid", "admin_granted"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestSubscription) return;

    const currentPlanId = this.extractPlanFromPayment(latestSubscription);
    if (!currentPlanId || currentPlanId === "unlimited") return;

    const cycleStart = latestSubscription.createdAt;
    const now = new Date();
    const cycleEnd = this.getBillingCycleEnd(cycleStart);

    if (now >= cycleEnd) return;

    const currentRank = this.getPlanRank(currentPlanId);
    const requestedRank = this.getPlanRank(requestedPlanId);

    if (requestedRank > currentRank) return;

    if (requestedPlanId === currentPlanId) {
      throw new BadRequestException(
        `You already have the ${currentPlanId} plan for the current billing cycle. You can renew it when the cycle ends.`,
      );
    }

    if (requestedPlanId !== currentPlanId) {
      throw new BadRequestException(
        `You currently have an active ${currentPlanId} plan. Only upgrades are allowed before cycle end.`,
      );
    }
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

      const matched = await this.prisma.payment.findMany({
        where: {
          method: { startsWith: `stripe:${session.id}` },
          status: { notIn: ["paid", "admin_granted"] },
        },
        select: { id: true, userId: true, planId: true, method: true, amount: true },
      });

      if (matched.length === 0) {
        return;
      }

      await this.prisma.payment.updateMany({
        where: {
          id: { in: matched.map((payment) => payment.id) },
          status: { notIn: ["paid", "admin_granted"] },
        },
        data: { status: "paid" },
      });

      for (const payment of matched) {
        const planId = this.extractPlanFromPayment(payment);
        await this.syncQuotaForPlan(payment.userId, planId);
      }
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