import { IsNotEmpty, IsString } from "class-validator";

export class GuiReadyCallbackDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
