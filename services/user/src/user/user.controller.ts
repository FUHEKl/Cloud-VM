import {
  Controller,
  Get,
  Patch,
  Post,
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
import { AdminSetSubscriptionDto } from "./dto/admin-set-subscription.dto";
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

  @Post("student-verification/request")
  requestStudentVerification(@CurrentUser() user: any) {
    return this.userService.requestStudentEmailVerification(user.userId);
  }

  @Post("student-verification/confirm")
  confirmStudentVerification(
    @CurrentUser() user: any,
    @Body() body: { code: string },
  ) {
    return this.userService.confirmStudentEmailVerification(user.userId, body.code);
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

  @Get("admin/billing-overview")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  getAdminBillingOverview(
    @CurrentUser() user: { userId: string; role: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
  ) {
    this.assertAdmin(user);
    return this.userService.getAdminBillingOverview(
      user.role,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
    );
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  findById(@CurrentUser() user: { role: string }, @Param("id") id: string) {
    this.assertAdmin(user);
    return this.userService.findById(id, user.role);
  }

  @Get(":id/billing-summary")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  getUserBillingSummary(
    @CurrentUser() user: { userId: string; role: string },
    @Param("id") id: string,
  ) {
    this.assertAdmin(user);
    return this.userService.getUserBillingSummary(id, user.role);
  }

  @Patch(":id/subscription")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  setUserSubscription(
    @CurrentUser() user: { userId: string; role: string },
    @Param("id") id: string,
    @Body() dto: AdminSetSubscriptionDto,
  ) {
    this.assertAdmin(user);
    return this.userService.setUserSubscription(id, dto, user.role, user.userId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  adminUpdateUser(
    @CurrentUser() user: { userId: string; role: string },
    @Param("id") id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    this.assertAdmin(user);
    return this.userService.adminUpdateUser(id, dto, user.role, user.userId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  deleteUser(@CurrentUser() user: { role: string }, @Param("id") id: string) {
    this.assertAdmin(user);
    return this.userService.deleteUser(id, user.role);
  }
}
