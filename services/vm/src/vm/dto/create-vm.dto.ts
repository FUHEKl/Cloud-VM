import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateVmDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9-]+$/)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(32)
  cpu!: number;

  @IsInt()
  @Min(512)
  @Max(65536)
  ramMb!: number;

  @IsInt()
  @Min(5)
  @Max(400)
  diskGb!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/)
  osTemplate!: string;

  @IsOptional()
  @IsString()
  planId?: string;
}
