import { IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class CreateUniversityDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[@.][a-z0-9.-]+\.[a-z]{2,}$/, {
    message: "Email domain must start with @ or . and use lowercase letters, numbers, dots, and hyphens.",
  })
  emailDomain!: string;
}
