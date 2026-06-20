import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CreateCheckoutSessionDto } from "./dto/create-checkout-session.dto";
import { ConfirmCheckoutSessionDto } from "./dto/confirm-checkout-session.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
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
    @Body() dto: ConfirmCheckoutSessionDto,
  ) {
    return this.paymentService.confirmCheckoutSession(user.userId, dto.sessionId);
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

  @Get("admin/plans")
  @UseGuards(JwtAuthGuard)
  async listAdminPlans(@CurrentUser() user: { role: string }) {
    return this.paymentService.adminGetAllPlans(user.role);
  }

  @Put("admin/plans/:planId")
  @UseGuards(JwtAuthGuard)
  async updateAdminPlan(
    @CurrentUser() user: { role: string },
    @Param("planId") planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.paymentService.adminUpdatePlan(user.role, planId, dto);
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