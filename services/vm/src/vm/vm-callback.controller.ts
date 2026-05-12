import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { VmService } from "./vm.service";
import { GuiReadyCallbackDto } from "./dto/gui-ready-callback.dto";

@Controller("vms")
export class VmCallbackController {
  constructor(private readonly vmService: VmService) {}

  @Post(":id/gui-ready")
  @HttpCode(HttpStatus.OK)
  async guiReadyCallback(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: GuiReadyCallbackDto,
  ): Promise<{ ok: true }> {
    await this.vmService.markGuiReady(id, body.token);
    return { ok: true };
  }
}
