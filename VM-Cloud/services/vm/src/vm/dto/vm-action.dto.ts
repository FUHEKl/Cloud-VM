import { IsIn, IsString } from "class-validator";

export class VmActionDto {
  @IsString()
  @IsIn(["start", "stop", "restart", "delete"])
  action!: "start" | "stop" | "restart" | "delete";
}
