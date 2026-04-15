import { IsString, MinLength } from "class-validator";

export class MfaReauthDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
