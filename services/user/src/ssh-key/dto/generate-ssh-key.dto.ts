import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class GenerateSshKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/)
  name?: string;
}
