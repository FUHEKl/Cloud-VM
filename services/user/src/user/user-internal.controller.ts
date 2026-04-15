import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Param,
  Post,
} from "@nestjs/common";
import { UserService } from "./user.service";

interface SyncUserPayload {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: "USER" | "ADMIN";
  isActive?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
  mfaEnabledAt?: string | null;
  mfaRecoveryCodeHashes?: string[];
  mfaRecoveryCodesGeneratedAt?: string | null;
}

@Controller("users/internal")
export class UserInternalController {
  constructor(private readonly userService: UserService) {}

  private assertSyncToken(syncToken: string | undefined) {
    const expected = (process.env.INTER_SERVICE_SYNC_TOKEN || "").trim();

    if (!expected || !syncToken || syncToken !== expected) {
      throw new UnauthorizedException("Invalid sync token");
    }
  }

  @Post("sync")
  @HttpCode(HttpStatus.OK)
  async syncUser(
    @Headers("x-sync-token") syncToken: string | undefined,
    @Body() payload: SyncUserPayload,
  ) {
    this.assertSyncToken(syncToken);

    if (!payload?.id || !payload?.email || !payload?.password) {
      throw new BadRequestException("Missing required sync payload fields");
    }

    const user = await this.userService.syncFromAuth(payload);
    return { ok: true, userId: user.id };
  }

  @Get("subscription-access/:userId")
  @HttpCode(HttpStatus.OK)
  async getSubscriptionAccess(
    @Headers("x-sync-token") syncToken: string | undefined,
    @Param("userId") userId: string,
  ) {
    this.assertSyncToken(syncToken);

    if (!userId) {
      throw new BadRequestException("Missing userId");
    }

    return this.userService.getInternalSubscriptionAccess(userId);
  }
}
