import { IsString, IsUUID, Length, Matches } from "class-validator";

export class VerifyMfaDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "MFA code must be a 6-digit number" })
  code!: string;
}
