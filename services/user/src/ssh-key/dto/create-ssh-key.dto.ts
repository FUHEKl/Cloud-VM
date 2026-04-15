import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateSshKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/)
  name!: string;

  @IsString()
  @MaxLength(4096)
  @Matches(/^ssh-/)
  publicKey!: string;
}
