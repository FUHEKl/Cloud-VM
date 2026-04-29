import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { EnableMfaDto } from "./dto/enable-mfa.dto";
import { MfaReauthDto } from "./dto/mfa-reauth.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { parseCookie } from "../common/security/request-security.util";

type RequestWithUser = Request & {
  user: {
    userId: string;
  };
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private shouldUseSecureCookies(req: Request): boolean {
    const policy = (process.env.AUTH_COOKIE_SECURE || "auto").toLowerCase();

    if (policy === "true") return true;
    if (policy === "false") return false;

    const forwardedProto = req.headers["x-forwarded-proto"];
    const forwardedProtoValue = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;

    // auto: secure on HTTPS requests/proxies, non-secure on plain localhost HTTP.
    return req.secure || forwardedProtoValue === "https";
  }

  private parseDurationMs(value: string, fallbackMs: number): number {
    const raw = (value || "").trim();
    if (!raw) return fallbackMs;

    const match = raw.match(/^(\d+)(ms|s|m|h|d)?$/i);
    if (!match) return fallbackMs;

    const amount = Number(match[1]);
    const unit = (match[2] || "ms").toLowerCase();
    const factor: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return amount * (factor[unit] ?? 1);
  }

  private setAuthCookies(req: Request, res: Response, rememberMe: boolean, tokens: {
    accessToken: string;
    refreshToken: string;
  }) {
    const secure = this.shouldUseSecureCookies(req);

    const accessMaxAge = rememberMe
      ? this.parseDurationMs(process.env.JWT_EXPIRES_IN || "15m", 15 * 60_000)
      : undefined;

    const refreshMaxAge = rememberMe
      ? this.parseDurationMs(
          process.env.JWT_REFRESH_EXPIRES_IN || "7d",
          7 * 24 * 60 * 60_000,
        )
      : undefined;

    // SECURITY: always HttpOnly + SameSite=Strict; secure flag depends on transport policy.
    res.cookie("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      ...(accessMaxAge ? { maxAge: accessMaxAge } : {}),
    });

    // SECURITY: refresh token cookie has stricter lifecycle and no JS access.
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      ...(refreshMaxAge ? { maxAge: refreshMaxAge } : {}),
    });
  }

  private clearAuthCookies(req: Request, res: Response) {
    const secure = this.shouldUseSecureCookies(req);

    // SECURITY: clear auth cookies on logout to invalidate browser session state.
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
    });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
    });
  }

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, req);
    this.setAuthCookies(req, res, true, result);
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req);
    const accessToken = (result as { accessToken?: unknown }).accessToken;
    const refreshToken = (result as { refreshToken?: unknown }).refreshToken;

    if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
      return result;
    }

    this.setAuthCookies(req, res, dto.rememberMe === true, {
      accessToken,
      refreshToken,
    });

    const user = (result as { user: unknown }).user;
    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyAdminMfa(
      dto.challengeId,
      dto.code,
      req,
    );

    this.setAuthCookies(req, res, result.rememberMe, result);

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      rememberMe: result.rememberMe,
    };
  }

  @Post("mfa/setup")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async setupMfa(@Req() req: RequestWithUser, @Body() dto: MfaReauthDto) {
    return this.authService.setupAdminTotpWithPassword(
      req.user.userId,
      dto.password,
      req,
    );
  }

  @Post("mfa/enable")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async enableMfa(@Req() req: RequestWithUser, @Body() dto: EnableMfaDto) {
    return this.authService.enableAdminTotp(req.user.userId, dto.code, req);
  }

  @Post("mfa/disable")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async disableMfa(@Req() req: RequestWithUser, @Body() dto: MfaReauthDto) {
    return this.authService.disableAdminTotp(req.user.userId, dto.password, req);
  }

  @Post("mfa/recovery-codes/regenerate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async regenerateRecoveryCodes(@Req() req: RequestWithUser, @Body() dto: MfaReauthDto) {
    return this.authService.regenerateRecoveryCodes(
      req.user.userId,
      dto.password,
      req,
    );
  }

  @Get("mfa/status")
  @UseGuards(JwtAuthGuard)
  async mfaStatus(@Req() req: RequestWithUser) {
    return this.authService.getMfaStatus(req.user.userId);
  }

  @Get("mfa/audit")
  @UseGuards(JwtAuthGuard)
  async mfaAudit(@Req() req: RequestWithUser) {
    return this.authService.getMfaAuditTrail(req.user.userId);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body("refreshToken") bodyRefreshToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefreshToken = parseCookie(req, "refreshToken");
    const refreshToken = bodyRefreshToken || cookieRefreshToken || "";

    const result = await this.authService.refreshTokens(refreshToken, req);

    // Preserve remember-me policy from non-HttpOnly helper cookie set by frontend.
    const rememberMe = parseCookie(req, "rememberMe") === "1";
    this.setAuthCookies(req, res, rememberMe, result);

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body("refreshToken") bodyRefreshToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefreshToken = parseCookie(req, "refreshToken");
    const refreshToken = bodyRefreshToken || cookieRefreshToken || "";
    this.clearAuthCookies(req, res);
    return this.authService.logout(refreshToken, req);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearAuthCookies(req, res);
    return this.authService.logoutAllSessions(req.user.userId, req);
  }

  // FIX: password change now goes through auth service so both auth DB
  // and user service projection stay in sync via syncUserProjection().
  @Post("password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, dto, req);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { userId: string }) {
    return this.authService.getProfile(user.userId);
  }
}