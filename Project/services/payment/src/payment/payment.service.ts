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

const PLAN_CATALOG: Record<PlanId, {
  name: string;
  amountMilli: number;
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  quota: {
    maxVms: number;
    maxCpu: number;
    maxRamMb: number;
    maxDiskGb: number;
  };
  description: string;
}> = {
  student: {
    name: "Student Plan",
    amountMilli: 29000,
    amountDt: 29,
    rank: 1,
    vmHoursMonthly: 60,
    quota: {
      maxVms: 2,
      maxCpu: 2,
      maxRamMb: 4096,
      maxDiskGb: 40,
    },
    description: "Up to 2 VMs · 60 VM hours/month · 2 vCPU / 4 GB / 40 GB",
  },
  pro: {
    name: "Pro Plan",
    amountMilli: 79000,
    amountDt: 79,
    rank: 2,
    vmHoursMonthly: 220,
    quota: {
      maxVms: 6,
      maxCpu: 8,
      maxRamMb: 16384,
      maxDiskGb: 120,
    },
    description: "Up to 6 VMs · 220 VM hours/month · 4 vCPU / 8 GB / 120 GB",
  },
  enterprise: {
    name: "Enterprise Plan",
    amountMilli: 199000,
    amountDt: 199,
    rank: 3,
    vmHoursMonthly: 900,
    quota: {
      maxVms: 20,
      maxCpu: 32,
      maxRamMb: 65536,
      maxDiskGb: 400,
    },
    description: "Up to 20 VMs · 900 VM hours/month · 8 vCPU / 16 GB / 400 GB",
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
    method?: string | null;
    amount: number;
  }): AnyPlanId | null {
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

    if (payment.amount >= 199) return "enterprise";
    if (payment.amount >= 79) return "pro";
    if (payment.amount >= 29) return "student";
    return null;
  }

  private getPlanRank(planId: AnyPlanId | null): number {
    if (!planId) return 0;
    if (planId === "unlimited") return 99;
    return PLAN_CATALOG[planId].rank;
  }

  private getVmHoursForPlan(planId: AnyPlanId): number {
    if (planId === "unlimited") return Number.MAX_SAFE_INTEGER;
    return PLAN_CATALOG[planId].vmHoursMonthly;
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
      const defaultEnded = cycleEnd;
      const ended = vm.status === "RUNNING"
        ? defaultEnded
        : vm.updatedAt < defaultEnded
          ? vm.updatedAt
          : defaultEnded;

      if (ended <= started) continue;
      totalHours += (ended.getTime() - started.getTime()) / (1000 * 60 * 60);
    }

    return Number(totalHours.toFixed(2));
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

    const planVms = await this.prisma.virtualMachine.findMany({
      where: {
        userId,
        createdAt: { lt: cycleEnd },
      },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const vmHoursUsed = this.estimateVmHoursUsed(planVms, cycleStart, now);
    const includedHours = this.getVmHoursForPlan(currentPlanId);

    if (requestedPlanId === currentPlanId && vmHoursUsed < includedHours) {
      throw new BadRequestException(
        `You already have the ${currentPlanId} plan for the current billing cycle. You can renew it when the cycle ends or after consuming ${includedHours} VM hours. Currently used: ${vmHoursUsed}h.`,
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
    if (this.stripe) {
      const pending = await this.prisma.payment.findMany({
        where: {
          userId,
          status: "pending",
          method: { startsWith: "stripe:" },
        },
        take: 20,
        orderBy: { createdAt: "desc" },
      });

      for (const payment of pending) {
        const method = payment.method || "";
        const sessionId = method.split(":")[1];
        if (!sessionId) continue;

        try {
          const session = await this.stripe.checkout.sessions.retrieve(sessionId);
          if (session.payment_status === "paid") {
            const planId = this.extractPlanFromPayment(payment);
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: { status: "paid" },
            });
            await this.syncQuotaForPlan(userId, planId);
          } else if (session.status === "expired") {
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: { status: "expired" },
            });
          }
        } catch {
          // Keep record as pending if Stripe session lookup fails.
        }
      }
    }

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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const matched = await this.prisma.payment.findMany({
        where: { method: { startsWith: `stripe:${session.id}` } },
        select: { id: true, userId: true, method: true, amount: true },
      });

      await this.prisma.payment.updateMany({
        where: { method: { startsWith: `stripe:${session.id}` } },
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
        where: { method: { startsWith: `stripe:${session.id}` } },
        data: { status: "expired" },
      });
    }
  }
}