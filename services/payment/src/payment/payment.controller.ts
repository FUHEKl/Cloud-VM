import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateCheckoutSessionDto } from "./dto/create-checkout-session.dto";
import { PaymentService } from "./payment.service";

@Controller("payments")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("checkout-session")
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.paymentService.createCheckoutSession(user.userId, user.role, dto.planId);
  }

  @Post("confirm-session")
  @UseGuards(JwtAuthGuard)
  async confirmCheckoutSession(
    @CurrentUser() user: { userId: string },
    @Body() dto: { sessionId?: string },
  ) {
    return this.paymentService.confirmCheckoutSession(user.userId, dto?.sessionId || "");
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async listMyPayments(@CurrentUser() user: { userId: string }) {
    return this.paymentService.listPayments(user.userId);
  }

  @Get("plans")
  async listPublicPlans() {
    return this.paymentService.getPublicPlans();
  }

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Headers("stripe-signature") stripeSignature?: string,
  ) {
    await this.paymentService.handleWebhook(req.body as Buffer, stripeSignature);
    return { received: true };
  }
}