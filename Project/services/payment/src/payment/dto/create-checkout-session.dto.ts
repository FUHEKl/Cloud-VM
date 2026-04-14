import { IsIn, IsString } from "class-validator";

export class CreateCheckoutSessionDto {
  @IsString()
  @IsIn(["student", "pro", "enterprise"])
  planId!: "student" | "pro" | "enterprise";
}