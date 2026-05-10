import { IsString, Length, Matches } from "class-validator";

export class ConfirmStudentVerificationDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "Verification code must be a 6-digit number" })
  code!: string;
}
