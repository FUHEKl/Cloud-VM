import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ChatMessageDto {
  @IsIn(["user", "assistant", "system"])
  role!: "user" | "assistant" | "system";

  @IsString()
  @MaxLength(8000)
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsBoolean()
  includeContext?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2_000_000, { each: true })
  images?: string[];
}
