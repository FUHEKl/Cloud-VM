import { IsNotEmpty, IsOptional, IsString, Length, Matches } from "class-validator";

export class UpdateUniversityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[@.][a-z0-9.-]+\.[a-z]{2,}$/, {
    message: "Email domain must start with @ or . and use lowercase letters, numbers, dots, and hyphens.",
  })
  emailDomain?: string;
}
