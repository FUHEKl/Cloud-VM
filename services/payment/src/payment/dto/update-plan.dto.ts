import { IsNumber, IsOptional, Min } from "class-validator";

export class UpdatePlanDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountDt?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  vmHoursMonthly?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxVms?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxCpu?: number;

  @IsOptional()
  @IsNumber()
  @Min(512)
  maxRamMb?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  maxDiskGb?: number;
}
