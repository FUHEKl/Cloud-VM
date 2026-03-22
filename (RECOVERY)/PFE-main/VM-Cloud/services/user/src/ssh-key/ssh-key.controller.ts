import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { SshKeyService } from "./ssh-key.service";
import { CreateSshKeyDto } from "./dto/create-ssh-key.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("ssh-keys")
@UseGuards(JwtAuthGuard)
export class SshKeyController {
  constructor(private readonly sshKeyService: SshKeyService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.sshKeyService.findAllByUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateSshKeyDto) {
    return this.sshKeyService.create(user.userId, dto);
  }

  @Delete(":id")
  delete(@CurrentUser() user: any, @Param("id") id: string) {
    return this.sshKeyService.delete(id, user.userId);
  }
}
