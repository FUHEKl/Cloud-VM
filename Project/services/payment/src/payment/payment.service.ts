import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";

type PlanId = "student" | "pro" | "enterprise";

const PLAN_CATALOG: Record<PlanId, {
  name: string;
  amountMilli: number;
  amountDt: number;
  description: string;
}> = {
  student: {
    name: "Student Plan",
    amountMilli: 29000,
    amountDt: 29,
    description: "Up to 2 VMs · 60 VM hours/month · 2 vCPU / 4 GB / 40 GB",
  },
  pro: {
    name: "Pro Plan",
    amountMilli: 79000,
    amountDt: 79,
    description: "Up to 6 VMs · 220 VM hours/month · 4 vCPU / 8 GB / 120 GB",
  },
  enterprise: {
    name: "Enterprise Plan",
    amountMilli: 199000,
    amountDt: 199,
    description: "Up to 20 VMs · 900 VM hours/month · 8 vCPU / 16 GB / 400 GB",
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

    const firstCors = (process.env.CORS_ORIGIN || "https://localhost")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)[0];

    return firstCors || "https://localhost";
  }

  async createCheckoutSession(userId: string, planId: PlanId) {
    if (!this.stripe) {
      throw new InternalServerErrorException("Stripe is not configured on this environment");
    }

    const plan = PLAN_CATALOG[planId];
    if (!plan) {
      throw new BadRequestException("Invalid plan id");
    }

    const origin = this.getPublicOrigin();

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "tnd",
            unit_amount: plan.amountMilli,
            product_data: {
              name: plan.name,
              description: plan.description,
            },
          },
        },
      ],
      metadata: {
        userId,
        planId,
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
        method: `stripe:${session.id}`,
      },
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      amountDt: plan.amountDt,
      currency: "TND",
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.prisma.payment.updateMany({
        where: { method: `stripe:${session.id}` },
        data: { status: "paid" },
      });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.prisma.payment.updateMany({
        where: { method: `stripe:${session.id}` },
        data: { status: "expired" },
      });
    }
  }
}