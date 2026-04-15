import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
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

  @Post("sync")
  @HttpCode(HttpStatus.OK)
  async syncUser(
    @Headers("x-sync-token") syncToken: string | undefined,
    @Body() payload: SyncUserPayload,
  ) {
    const expected = (process.env.INTER_SERVICE_SYNC_TOKEN || "").trim();

    if (!expected || !syncToken || syncToken !== expected) {
      throw new UnauthorizedException("Invalid sync token");
    }

    if (!payload?.id || !payload?.email || !payload?.password) {
      throw new BadRequestException("Missing required sync payload fields");
    }

    const user = await this.userService.syncFromAuth(payload);
    return { ok: true, userId: user.id };
  }
}
