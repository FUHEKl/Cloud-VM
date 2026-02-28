import { IsString, MinLength } from "class-validator";

export class CreateSshKeyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  publicKey!: string;
}
