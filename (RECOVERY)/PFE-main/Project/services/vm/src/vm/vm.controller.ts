import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { VmService } from "./vm.service";
import { CreateVmDto } from "./dto/create-vm.dto";
import { VmActionDto } from "./dto/vm-action.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("vms")
@UseGuards(JwtAuthGuard)
export class VmController {
  constructor(private readonly vmService: VmService) {}

  @Post()
  create(
    @Body() dto: CreateVmDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.vmService.createVm(dto, user.userId);
  }

  @Get("stats")
  getStats(@CurrentUser() user: { userId: string; role: string }) {
    return this.vmService.getStats(user.userId, user.role);
  }

  @Get()
  findAll(
    @CurrentUser() user: { userId: string; role: string },
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.vmService.listVms(user.userId, user.role, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.vmService.getVm(id, user.userId, user.role);
  }

  @Post(":id/action")
  performAction(
    @Param("id") id: string,
    @Body() dto: VmActionDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.vmService.vmAction(id, dto.action, user.userId, user.role);
  }

  @Delete(":id")
  remove(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.vmService.deleteVm(id, user.userId, user.role);
  }
}
