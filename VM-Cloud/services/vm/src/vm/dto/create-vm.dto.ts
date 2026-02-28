import { IsString, IsInt, IsOptional, Min, MinLength } from "class-validator";

export class CreateVmDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  cpu!: number;

  @IsInt()
  @Min(512)
  ramMb!: number;

  @IsInt()
  @Min(5)
  diskGb!: number;

  @IsString()
  @MinLength(1)
  osTemplate!: string;

  @IsOptional()
  @IsString()
  planId?: string;
}
