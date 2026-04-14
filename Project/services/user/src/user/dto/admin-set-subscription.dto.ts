import { IsEnum } from "class-validator";

export enum SubscriptionPlanId {
  STUDENT = "student",
  PRO = "pro",
  ENTERPRISE = "enterprise",
  UNLIMITED = "unlimited",
}

export class AdminSetSubscriptionDto {
  @IsEnum(SubscriptionPlanId)
  planId!: SubscriptionPlanId;
}
