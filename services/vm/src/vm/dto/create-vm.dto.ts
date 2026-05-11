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
  @Matches(/^(student|pro|enterprise|unlimited)$/)
  planId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_-]{2,31}$/, {
    message: "Username must be 3-32 chars, start with a letter or underscore",
  })
  vmUsername!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^\s:]{8,64}$/, {
    message:
      "Password needs 8-64 chars, uppercase, lowercase, number, no spaces or colons",
  })
  vmPassword!: string;
}
