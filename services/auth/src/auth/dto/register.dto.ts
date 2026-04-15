import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      "Password must include uppercase, lowercase, number, and special character",
  })
  password!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[^<>]*$/)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[^<>]*$/)
  lastName!: string;
}
