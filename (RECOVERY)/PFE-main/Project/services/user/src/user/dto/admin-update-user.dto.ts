import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { Role } from "@prisma/client";

export class AdminUpdateUserDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
