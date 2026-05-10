import { IsString, MinLength } from "class-validator";

export class ConfirmCheckoutSessionDto {
  @IsString()
  @MinLength(10)
  sessionId!: string;
}
