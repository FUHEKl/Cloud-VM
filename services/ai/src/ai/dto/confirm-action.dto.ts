import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ConfirmActionDto {
  @IsString()
  @MaxLength(2048)
  confirmationToken!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
