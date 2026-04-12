import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  private assertAdmin(user: { role?: string }) {
    // SECURITY: service-level admin enforcement (defense in depth).
    if (user?.role !== "ADMIN") {
      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          eventType: "permission.denied",
          userId: (user as any)?.userId ?? null,
          result: "denied",
        }),
      );
      throw new ForbiddenException("Admin role required");
    }
  }

  @Get("profile")
  getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.userId);
  }

  @Patch("profile")
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.userId, dto);
  }

  @Patch("profile/password")
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(user.userId, dto);
  }

  @Get("stats")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  getStats(@CurrentUser() user: { role: string }) {
    this.assertAdmin(user);
    return this.userService.getStats(user.role);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  findAll(
    @CurrentUser() user: { role: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
  ) {
    this.assertAdmin(user);
    return this.userService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      search,
      user.role,
    );
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  findById(@CurrentUser() user: { role: string }, @Param("id") id: string) {
    this.assertAdmin(user);
    return this.userService.findById(id, user.role);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  adminUpdateUser(
    @CurrentUser() user: { role: string },
    @Param("id") id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    this.assertAdmin(user);
    return this.userService.adminUpdateUser(id, dto, user.role);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  deleteUser(@CurrentUser() user: { role: string }, @Param("id") id: string) {
    this.assertAdmin(user);
    return this.userService.deleteUser(id, user.role);
  }
}
