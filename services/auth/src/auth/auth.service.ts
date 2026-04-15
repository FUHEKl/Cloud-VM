import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import * as bcrypt from "bcrypt";
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";
import Redis from "ioredis";
import { Request } from "express";
import {
  buildRequestFingerprint,
  getClientIp,
} from "../common/security/request-security.util";
import { SecurityLoggerService } from "../common/security/security-logger.service";
import {
  buildOtpAuthUrl,
  generateMfaCode,
  generateTotpSecret,
  verifyTotpCode,
} from "../common/security/totp.util";

interface RefreshPayload {
  sub: string;
  jti: string;
  type: "refresh";
  exp?: number;
}

interface MfaChallengePayload {
  userId: string;
  email: string;
  fingerprint: string;
  rememberMe: boolean;
  mode: "temporary" | "totp";
  code?: string;
  secret?: string;
}

interface MfaPendingSetupPayload {
  userId: string;
  email: string;
  secret: string;
  fingerprint: string;
}

interface LoginContextPayload {
  fingerprint: string;
  ip: string;
  userAgent: string;
  lastSeenAt: string;
}

export interface MfaAuditEntry {
  action: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  metadata: unknown;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly redis = new Redis(
    process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`,
    {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    },
  );

  private readonly lockWindowSeconds =
    Math.max(1, Number(process.env.AUTH_LOCK_WINDOW_MINUTES || "15")) * 60;
  private readonly lockProgressiveMultiplier = Math.max(
    1,
    Number(process.env.AUTH_LOCK_PROGRESSIVE_MULTIPLIER || "1"),
  );
  private readonly lockMaxSeconds =
    Math.max(1, Number(process.env.AUTH_LOCK_MAX_MINUTES || "60")) * 60;
  private readonly maxFailedAttempts = Math.max(
    1,
    Number(process.env.AUTH_LOCK_MAX_ATTEMPTS || "5"),
  );
  private readonly captchaEnabled =
    (process.env.AUTH_CAPTCHA_ENABLED || "false").toLowerCase() === "true";
  private readonly captchaFailThreshold = Math.max(
    1,
    Number(process.env.AUTH_CAPTCHA_FAIL_THRESHOLD || "3"),
  );
  private readonly captchaSharedSecret = (process.env.AUTH_CAPTCHA_SHARED_SECRET || "").trim();
  private readonly adminMfaEnabled =
    (process.env.ADMIN_MFA_ENABLED || "true").toLowerCase() !== "false";
  private readonly mfaTtlSeconds = Math.max(
    60,
    Number(process.env.ADMIN_MFA_TTL_SECONDS || "300"),
  );
  private readonly mfaIssuer = process.env.ADMIN_MFA_ISSUER || "CloudVM";
  private readonly mfaSetupTtlSeconds = Math.max(
    60,
    Number(process.env.ADMIN_MFA_SETUP_TTL_SECONDS || "600"),
  );
  private readonly mfaTempBootstrapEnabled =
    (process.env.ADMIN_MFA_TEMP_BOOTSTRAP_ENABLED || "true").toLowerCase() !== "false";
  private readonly mfaMaxAttempts = Math.max(
    1,
    Number(process.env.ADMIN_MFA_MAX_ATTEMPTS || "5"),
  );
  private readonly mfaRecoveryCodesCount = Math.max(
    5,
    Number(process.env.ADMIN_MFA_RECOVERY_CODES_COUNT || "10"),
  );
  private readonly anomalyRiskThreshold = Math.max(
    1,
    Number(process.env.AUTH_ANOMALY_RISK_THRESHOLD || "70"),
  );
  private readonly anomalyMode =
    (process.env.AUTH_ANOMALY_MODE || "log").trim().toLowerCase() === "block"
      ? "block"
      : "log";
  private readonly loginContextTtlSeconds = Math.max(
    3600,
    Number(process.env.AUTH_LOGIN_CONTEXT_TTL_SECONDS || `${90 * 24 * 60 * 60}`),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly securityLogger: SecurityLoggerService,
  ) {
    // SECURITY/RESILIENCE: prevent unhandled ioredis error events and keep diagnostics visible.
    this.redis.on("error", (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  private parseDurationMs(value: string, fallbackMs: number): number {
    const raw = (value || "").trim();
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

  private parseDurationSeconds(value: string, fallbackSeconds: number): number {
    return Math.ceil(this.parseDurationMs(value, fallbackSeconds * 1000) / 1000);
  }

  private async ensureRedisConnected() {
    if (this.redis.status !== "ready") {
      await this.redis.connect();
    }
  }

  private getLockKey(email: string): string {
    return `security:auth:lock:${email.toLowerCase()}`;
  }

  private getFailKey(email: string): string {
    return `security:auth:fail:${email.toLowerCase()}`;
  }

  private getRefreshReuseKey(jti: string): string {
    return `security:auth:refresh-used:${jti}`;
  }

  private getLockStreakKey(email: string): string {
    return `security:auth:lock-streak:${email.toLowerCase()}`;
  }

  private getMfaChallengeKey(challengeId: string): string {
    return `security:auth:mfa:challenge:${challengeId}`;
  }

  private getMfaAttemptsKey(challengeId: string): string {
    return `security:auth:mfa:attempts:${challengeId}`;
  }

  private getMfaSetupKey(userId: string): string {
    return `security:auth:mfa:setup:${userId}`;
  }

  private getLoginContextKey(userId: string): string {
    return `security:auth:login-context:${userId}`;
  }

  private getUserAgent(req: Request): string {
    const userAgent = req.headers["user-agent"];
    return Array.isArray(userAgent) ? userAgent[0] || "unknown" : (userAgent || "unknown");
  }

  private normalizeRecoveryCode(input: string): string {
    return (input || "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: this.mfaRecoveryCodesCount }, () => {
      const raw = randomBytes(4).toString("hex").toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    });
  }

  private async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => bcrypt.hash(this.normalizeRecoveryCode(code), 10)));
  }

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = this.normalizeRecoveryCode(code);
    if (normalized.length < 8) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mfaRecoveryCodeHashes: true } as any,
    });

    if (!user) return false;

    const hashes = (((user as any).mfaRecoveryCodeHashes as string[] | null) || []).slice();
    if (hashes.length === 0) return false;

    let matchedIndex = -1;
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(normalized, hashes[i])) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex < 0) return false;

    hashes.splice(matchedIndex, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaRecoveryCodeHashes: hashes,
      } as any,
    });

    return true;
  }

  private async assertCurrentPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, role: true, isActive: true, mfaEnabled: true } as any,
    });

    if (!user || !(user as any).isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    const isValid = await bcrypt.compare(password || "", (user as any).password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid password for MFA re-authentication");
    }

    return user;
  }

  private async logMfaAudit(
    userId: string,
    action: string,
    req: Request,
    metadata?: unknown,
  ) {
    try {
      await this.prisma.mfaAuditLog.create({
        data: {
          userId,
          action,
          ip: getClientIp(req),
          userAgent: this.getUserAgent(req),
          metadata: (metadata || null) as any,
        } as any,
      });
    } catch {
      // best-effort audit write; do not block auth flow
    }
  }

  private safeCodeEqual(expected: string, received: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  private getUserSyncUrl(): string {
    if (process.env.USER_SERVICE_SYNC_URL?.trim()) {
      return process.env.USER_SERVICE_SYNC_URL.trim();
    }

    const base = (process.env.USER_SERVICE_URL || "http://user:3003").replace(/\/+$/, "");
    return `${base}/users/internal/sync`;
  }

  private async syncUserProjection(user: any): Promise<void> {
    const syncToken = (process.env.INTER_SERVICE_SYNC_TOKEN || "").trim();
    if (!syncToken) {
      this.logger.warn("INTER_SERVICE_SYNC_TOKEN not set; skipping user projection sync");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.getUserSyncUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-token": syncToken,
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          mfaEnabledAt: user.mfaEnabledAt,
          mfaRecoveryCodeHashes: user.mfaRecoveryCodeHashes,
          mfaRecoveryCodesGeneratedAt: user.mfaRecoveryCodesGeneratedAt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`sync failed with status ${response.status}: ${body}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getPreviousLoginContext(userId: string): Promise<LoginContextPayload | null> {
    await this.ensureRedisConnected();
    const raw = await this.redis.get(this.getLoginContextKey(userId));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as LoginContextPayload;
      if (!parsed?.fingerprint || !parsed?.ip || !parsed?.userAgent) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async storeLoginContext(userId: string, req: Request): Promise<void> {
    const payload: LoginContextPayload = {
      fingerprint: buildRequestFingerprint(req),
      ip: getClientIp(req),
      userAgent: this.getUserAgent(req),
      lastSeenAt: new Date().toISOString(),
    };

    try {
      await this.ensureRedisConnected();
      await this.redis.set(
        this.getLoginContextKey(userId),
        JSON.stringify(payload),
        "EX",
        this.loginContextTtlSeconds,
      );
    } catch {
      // Best effort only. Login must proceed even if redis is unavailable.
    }
  }

  private async evaluateLoginAnomaly(userId: string, req: Request) {
    const previous = await this.getPreviousLoginContext(userId);
    if (!previous) {
      return {
        detected: false,
        score: 0,
        reasons: ["no_prior_context"],
      };
    }

    let score = 0;
    const reasons: string[] = [];

    const currentFingerprint = buildRequestFingerprint(req);
    const currentIp = getClientIp(req);
    const currentUserAgent = this.getUserAgent(req);

    if (currentFingerprint !== previous.fingerprint) {
      score += 70;
      reasons.push("fingerprint_changed");
    }

    if (currentIp !== previous.ip) {
      score += 25;
      reasons.push("ip_changed");
    }

    if (currentUserAgent !== previous.userAgent) {
      score += 15;
      reasons.push("user_agent_changed");
    }

    const previousSeenAt = Date.parse(previous.lastSeenAt || "");
    if (Number.isFinite(previousSeenAt)) {
      const daysSinceLastSeen = (Date.now() - previousSeenAt) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSeen > 30) {
        score += 10;
        reasons.push("long_gap_since_last_login");
      }
    }

    return {
      detected: score >= this.anomalyRiskThreshold,
      score,
      reasons,
    };
  }

  private async assertNotLocked(email: string, req: Request) {
    await this.ensureRedisConnected();
    const lockKey = this.getLockKey(email);
    const ttl = await this.redis.ttl(lockKey);

    if (ttl > 0) {
      const minutes = Math.ceil(ttl / 60);
      this.securityLogger.log({
        eventType: "auth.account.lockout",
        ip: getClientIp(req),
        result: "blocked",
        metadata: {
          email,
          retryAfterSeconds: ttl,
        },
      });
      throw new HttpException(
        `Too many failed login attempts. Try again in ${minutes} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async registerFailedLogin(email: string, req: Request) {
    await this.ensureRedisConnected();
    const failKey = this.getFailKey(email);
    const lockKey = this.getLockKey(email);

    const attempts = await this.redis.incr(failKey);
    if (attempts === 1) {
      await this.redis.expire(failKey, this.lockWindowSeconds);
    }

    this.securityLogger.log({
      eventType: "auth.login.failure",
      ip: getClientIp(req),
      result: "failure",
      metadata: {
        email,
        attempts,
      },
    });

    if (attempts >= this.maxFailedAttempts) {
      const streakKey = this.getLockStreakKey(email);
      const streak = await this.redis.incr(streakKey);
      await this.redis.expire(streakKey, 24 * 60 * 60);

      const progressiveSeconds = Math.min(
        this.lockMaxSeconds,
        Math.round(this.lockWindowSeconds * this.lockProgressiveMultiplier ** Math.max(0, streak - 1)),
      );

      await this.redis.set(lockKey, "1", "EX", progressiveSeconds);
      this.securityLogger.log({
        eventType: "auth.account.lockout",
        ip: getClientIp(req),
        result: "blocked",
        metadata: {
          email,
          lockoutSeconds: progressiveSeconds,
          streak,
        },
      });
      throw new HttpException(
        `Too many failed login attempts. Try again in ${Math.ceil(progressiveSeconds / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async isCaptchaRequired(email: string): Promise<boolean> {
    if (!this.captchaEnabled) return false;
    await this.ensureRedisConnected();
    const failCountRaw = await this.redis.get(this.getFailKey(email));
    const failCount = Number(failCountRaw || "0");
    return failCount >= this.captchaFailThreshold;
  }

  private async assertCaptchaIfNeeded(email: string, captchaToken: string | undefined, req: Request) {
    const required = await this.isCaptchaRequired(email);
    if (!required) return;

    const token = (captchaToken || "").trim();
    if (!token) {
      this.securityLogger.log({
        eventType: "auth.captcha.required_missing",
        ip: getClientIp(req),
        result: "blocked",
        metadata: { email },
      });
      throw new HttpException(
        {
          statusCode: 403,
          message: "CAPTCHA verification required",
          error: "Forbidden",
          captchaRequired: true,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (this.captchaSharedSecret) {
      const expected = Buffer.from(this.captchaSharedSecret);
      const provided = Buffer.from(token);
      const valid =
        expected.length === provided.length && timingSafeEqual(expected, provided);

      if (!valid) {
        this.securityLogger.log({
          eventType: "auth.captcha.invalid",
          ip: getClientIp(req),
          result: "blocked",
          metadata: { email },
        });
        throw new HttpException(
          {
            statusCode: 403,
            message: "CAPTCHA verification failed",
            error: "Forbidden",
            captchaRequired: true,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    this.securityLogger.log({
      eventType: "auth.captcha.passed",
      ip: getClientIp(req),
      result: "success",
      metadata: {
        email,
        verificationMode: this.captchaSharedSecret ? "shared-secret" : "presence-only",
      },
    });
  }

  private async clearFailedLogins(email: string) {
    await this.ensureRedisConnected();
    await this.redis.del(this.getFailKey(email), this.getLockKey(email));
  }

  async register(dto: RegisterDto, req: Request) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException("Email already in use");
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const freePlanMaxVms = Number(process.env.AUTH_FREE_PLAN_MAX_VMS || "2");
    const freePlanMaxCpu = Number(process.env.AUTH_FREE_PLAN_MAX_CPU || "2");
    const freePlanMaxRamMb = Number(process.env.AUTH_FREE_PLAN_MAX_RAM_MB || "4096");
    const freePlanMaxDiskGb = Number(process.env.AUTH_FREE_PLAN_MAX_DISK_GB || "40");

    if (
      !Number.isFinite(freePlanMaxVms) || freePlanMaxVms < 1 ||
      !Number.isFinite(freePlanMaxCpu) || freePlanMaxCpu < 1 ||
      !Number.isFinite(freePlanMaxRamMb) || freePlanMaxRamMb < 512 ||
      !Number.isFinite(freePlanMaxDiskGb) || freePlanMaxDiskGb < 5
    ) {
      throw new InternalServerErrorException(
        "Invalid AUTH_FREE_PLAN_* configuration",
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        quota: {
          create: {
            maxVms: Math.floor(freePlanMaxVms),
            maxCpu: Math.floor(freePlanMaxCpu),
            maxRamMb: Math.floor(freePlanMaxRamMb),
            maxDiskGb: Math.floor(freePlanMaxDiskGb),
          },
        },
      },
    });

    try {
      await this.syncUserProjection(user);
    } catch (error) {
      this.logger.error(`User projection sync failed after register: ${(error as Error).message}`);
    }

    const tokens = await this.generateTokens(user, req);
    await this.storeLoginContext(user.id, req);

    this.securityLogger.log({
      eventType: "auth.register.success",
      userId: user.id,
      ip: getClientIp(req),
      result: "success",
      metadata: { email: user.email },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.excludePassword(user),
    };
  }

  async login(dto: LoginDto, req: Request) {
    await this.assertNotLocked(dto.email, req);
    await this.assertCaptchaIfNeeded(dto.email, dto.captchaToken, req);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await this.registerFailedLogin(dto.email, req);
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      await this.registerFailedLogin(dto.email, req);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.clearFailedLogins(dto.email);

    try {
      await this.syncUserProjection(user);
    } catch (error) {
      this.logger.error(`User projection sync failed after login: ${(error as Error).message}`);
    }

    const anomaly = await this.evaluateLoginAnomaly(user.id, req);
    if (anomaly.detected) {
      this.securityLogger.log({
        eventType: "auth.login.anomaly_detected",
        userId: user.id,
        ip: getClientIp(req),
        result: this.anomalyMode === "block" ? "blocked" : "failure",
        metadata: {
          email: user.email,
          score: anomaly.score,
          threshold: this.anomalyRiskThreshold,
          reasons: anomaly.reasons,
          mode: this.anomalyMode,
        },
      });

      if (this.anomalyMode === "block") {
        throw new HttpException(
          "Suspicious login detected. Please retry from a trusted network or contact support.",
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const isMfaEnabled = Boolean((user as any).mfaEnabled);
    const userMfaSecret = ((user as any).mfaSecret as string | null) || null;

    if (isMfaEnabled && userMfaSecret) {
      await this.ensureRedisConnected();
      const challengeId = randomUUID();
      const payload: MfaChallengePayload = {
        userId: user.id,
        email: user.email,
        fingerprint: buildRequestFingerprint(req),
        rememberMe: dto.rememberMe === true,
        mode: "totp",
        secret: userMfaSecret,
      };

      await this.redis.set(
        this.getMfaChallengeKey(challengeId),
        JSON.stringify(payload),
        "EX",
        this.mfaTtlSeconds,
      );

      this.securityLogger.log({
        eventType: "auth.mfa.challenge_issued",
        userId: user.id,
        ip: getClientIp(req),
        result: "success",
        metadata: {
          email: user.email,
          challengeId,
          mode: "totp",
        },
      });

      return {
        mfaRequired: true,
        challengeId,
        message: "MFA verification required",
      };
    }

    if (this.adminMfaEnabled && user.role === "ADMIN") {
      if (!this.mfaTempBootstrapEnabled) {
        return {
          mfaEnrollmentRequired: true,
          message:
            "Admin MFA is required but not configured. Sign in once via a bootstrap flow and complete /auth/mfa/setup.",
        };
      }

      await this.ensureRedisConnected();
      const challengeId = randomUUID();
      const code = generateMfaCode();
      const payload: MfaChallengePayload = {
        userId: user.id,
        email: user.email,
        fingerprint: buildRequestFingerprint(req),
        rememberMe: dto.rememberMe === true,
        mode: "temporary",
        code,
      };

      await this.redis.set(
        this.getMfaChallengeKey(challengeId),
        JSON.stringify(payload),
        "EX",
        this.mfaTtlSeconds,
      );

      this.securityLogger.log({
        eventType: "auth.mfa.challenge_issued",
        userId: user.id,
        ip: getClientIp(req),
        result: "success",
        metadata: {
          email: user.email,
          challengeId,
          mode: "temporary",
        },
      });

      if (process.env.NODE_ENV !== "production") {
        this.logger.warn(
          `[DEV MFA] admin=${user.email} challengeId=${challengeId} code=${code}`,
        );
      }

      return {
        mfaRequired: true,
        challengeId,
        message: "MFA verification required for admin account",
        ...(process.env.NODE_ENV !== "production" ? { devOtp: code } : {}),
      };
    }

    const tokens = await this.generateTokens(user, req);
    await this.storeLoginContext(user.id, req);

    this.securityLogger.log({
      eventType: "auth.login.success",
      userId: user.id,
      ip: getClientIp(req),
      result: "success",
      metadata: { email: user.email },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.excludePassword(user),
    };
  }

  async verifyAdminMfa(challengeId: string, code: string, req: Request) {
    await this.ensureRedisConnected();

    const challengeKey = this.getMfaChallengeKey(challengeId);
    const attemptsKey = this.getMfaAttemptsKey(challengeId);
    const rawPayload = await this.redis.get(challengeKey);

    if (!rawPayload) {
      throw new UnauthorizedException("MFA challenge expired or invalid");
    }

    let payload: MfaChallengePayload;
    try {
      payload = JSON.parse(rawPayload) as MfaChallengePayload;
    } catch {
      await this.redis.del(challengeKey, attemptsKey);
      throw new UnauthorizedException("MFA challenge is corrupted");
    }

    const fingerprint = buildRequestFingerprint(req);
    if (payload.fingerprint !== fingerprint) {
      await this.redis.del(challengeKey, attemptsKey);
      this.securityLogger.log({
        eventType: "auth.mfa.fingerprint_mismatch",
        userId: payload.userId,
        ip: getClientIp(req),
        result: "blocked",
      });
      throw new UnauthorizedException("MFA challenge fingerprint mismatch");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mfaRecoveryCodeHashes: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    let isValidCode = false;
    if (payload.mode === "totp") {
      isValidCode = Boolean(payload.secret) && verifyTotpCode(payload.secret!, code, 1);

      if (!isValidCode) {
        const consumed = await this.consumeRecoveryCode(payload.userId, code);
        if (consumed) {
          isValidCode = true;
          await this.logMfaAudit(payload.userId, "recovery_code_used", req);
        }
      }
    } else {
      isValidCode = Boolean(payload.code) && this.safeCodeEqual(payload.code!, code);
    }

    if (!isValidCode) {
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) {
        await this.redis.expire(attemptsKey, this.mfaTtlSeconds);
      }

      if (attempts >= this.mfaMaxAttempts) {
        await this.redis.del(challengeKey, attemptsKey);
        throw new HttpException(
          "Too many failed MFA attempts. Start login again.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException("Invalid MFA code");
    }

    await this.redis.del(challengeKey, attemptsKey);

    const tokens = await this.generateTokens(user, req);
    await this.storeLoginContext(user.id, req);

    this.securityLogger.log({
      eventType: "auth.mfa.verified",
      userId: user.id,
      ip: getClientIp(req),
      result: "success",
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      rememberMe: payload.rememberMe,
    };
  }

  async setupAdminTotp(userId: string, req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        mfaEnabled: true,
      } as any,
    });

    if (!user) {
      throw new UnauthorizedException("Only authenticated users can configure MFA");
    }

    await this.ensureRedisConnected();
    const secret = generateTotpSecret();
    const fingerprint = buildRequestFingerprint(req);
    const setupPayload: MfaPendingSetupPayload = {
      userId: (user as any).id,
      email: (user as any).email,
      secret,
      fingerprint,
    };

    await this.redis.set(
      this.getMfaSetupKey((user as any).id),
      JSON.stringify(setupPayload),
      "EX",
      this.mfaSetupTtlSeconds,
    );

    const otpAuthUrl = buildOtpAuthUrl(secret, `${this.mfaIssuer}:${(user as any).email}`, this.mfaIssuer);

    this.securityLogger.log({
      eventType: "auth.mfa.setup.issued",
      userId: (user as any).id,
      ip: getClientIp(req),
      result: "success",
    });

    return {
      mfaEnabled: Boolean((user as any).mfaEnabled),
      setupExpiresInSeconds: this.mfaSetupTtlSeconds,
      secret,
      otpAuthUrl,
      issuer: this.mfaIssuer,
      accountName: (user as any).email,
    };
  }

  async setupAdminTotpWithPassword(userId: string, currentPassword: string, req: Request) {
    await this.assertCurrentPassword(userId, currentPassword);
    const result = await this.setupAdminTotp(userId, req);
    await this.logMfaAudit(userId, "setup_issued", req, {
      setupExpiresInSeconds: result.setupExpiresInSeconds,
      wasPreviouslyEnabled: result.mfaEnabled,
    });
    return result;
  }

  async enableAdminTotp(userId: string, code: string, req: Request) {
    await this.ensureRedisConnected();
    const setupKey = this.getMfaSetupKey(userId);
    const rawSetup = await this.redis.get(setupKey);

    if (!rawSetup) {
      throw new UnauthorizedException("MFA setup session expired. Re-run setup.");
    }

    let setup: MfaPendingSetupPayload;
    try {
      setup = JSON.parse(rawSetup) as MfaPendingSetupPayload;
    } catch {
      await this.redis.del(setupKey);
      throw new UnauthorizedException("MFA setup session is invalid");
    }

    if (setup.userId !== userId) {
      throw new UnauthorizedException("MFA setup does not belong to current user");
    }

    const fingerprint = buildRequestFingerprint(req);
    if (setup.fingerprint !== fingerprint) {
      await this.redis.del(setupKey);
      throw new UnauthorizedException("MFA setup fingerprint mismatch");
    }

    if (!verifyTotpCode(setup.secret, code, 1)) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true } as any,
    });

    if (!user) {
      throw new UnauthorizedException("Only authenticated users can configure MFA");
    }

    const plainRecoveryCodes = this.generateRecoveryCodes();
    const hashedRecoveryCodes = await this.hashRecoveryCodes(plainRecoveryCodes);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: setup.secret,
        mfaRecoveryCodeHashes: hashedRecoveryCodes,
        mfaRecoveryCodesGeneratedAt: new Date(),
        mfaEnabledAt: new Date(),
      } as any,
    });

    await this.redis.del(setupKey);

    this.securityLogger.log({
      eventType: "auth.mfa.setup.enabled",
      userId,
      ip: getClientIp(req),
      result: "success",
    });

    await this.logMfaAudit(userId, "setup_enabled", req, {
      recoveryCodesCount: plainRecoveryCodes.length,
    });

    return {
      mfaEnabled: true,
      recoveryCodes: plainRecoveryCodes,
      recoveryCodesGeneratedAt: new Date().toISOString(),
    };
  }

  async disableAdminTotp(userId: string, currentPassword: string, req: Request) {
    await this.assertCurrentPassword(userId, currentPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodeHashes: [],
        mfaRecoveryCodesGeneratedAt: null,
        mfaEnabledAt: null,
      } as any,
    });

    await this.ensureRedisConnected();
    await this.redis.del(this.getMfaSetupKey(userId));

    this.securityLogger.log({
      eventType: "auth.mfa.setup.disabled",
      userId,
      ip: getClientIp(req),
      result: "success",
    });

    await this.logMfaAudit(userId, "setup_disabled", req);

    return {
      mfaEnabled: false,
    };
  }

  async regenerateRecoveryCodes(userId: string, currentPassword: string, req: Request) {
    const user = await this.assertCurrentPassword(userId, currentPassword);

    const mfaEnabled = Boolean((user as any).mfaEnabled);
    if (!mfaEnabled) {
      throw new UnauthorizedException("Enable MFA before generating recovery codes");
    }

    const plainRecoveryCodes = this.generateRecoveryCodes();
    const hashedRecoveryCodes = await this.hashRecoveryCodes(plainRecoveryCodes);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaRecoveryCodeHashes: hashedRecoveryCodes,
        mfaRecoveryCodesGeneratedAt: new Date(),
      } as any,
    });

    await this.logMfaAudit(userId, "recovery_codes_regenerated", req, {
      recoveryCodesCount: plainRecoveryCodes.length,
    });

    return {
      recoveryCodes: plainRecoveryCodes,
      recoveryCodesGeneratedAt: new Date().toISOString(),
    };
  }

  async getMfaStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mfaEnabled: true,
        mfaEnabledAt: true,
        mfaRecoveryCodeHashes: true,
        mfaRecoveryCodesGeneratedAt: true,
      } as any,
    });

    if (!user) {
      throw new UnauthorizedException("Only authenticated users can view MFA status");
    }

    const recoveryCodeHashes = ((user as any).mfaRecoveryCodeHashes as string[] | null) || [];

    return {
      mfaEnabled: Boolean((user as any).mfaEnabled),
      mfaEnabledAt: (user as any).mfaEnabledAt || null,
      recoveryCodesRemaining: recoveryCodeHashes.length,
      recoveryCodesGeneratedAt: (user as any).mfaRecoveryCodesGeneratedAt || null,
    };
  }

  async getMfaAuditTrail(userId: string): Promise<MfaAuditEntry[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true } as any,
    });

    if (!user) {
      throw new UnauthorizedException("Only authenticated users can view MFA audit trail");
    }

    const rows = await this.prisma.mfaAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        action: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        metadata: true,
      } as any,
    });

    return rows.map((row: any) => ({
      action: String(row.action),
      ip: row.ip || "unknown",
      userAgent: row.userAgent || "unknown",
      createdAt: row.createdAt,
      metadata: row.metadata || null,
    }));
  }

  async generateTokens(
    user: { id: string; email: string; role: string },
    req: Request,
  ) {
    const fingerprint = buildRequestFingerprint(req);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      fp: fingerprint,
    });

    const refreshTokenJti = randomUUID();
    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        type: "refresh",
        jti: refreshTokenJti,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET || "",
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
      },
    );

    const expiresAt = new Date();
    expiresAt.setTime(
      expiresAt.getTime() +
        this.parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN || "7d", 7 * 24 * 60 * 60_000),
    );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string, req: Request) {
    if (!refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    let decoded: RefreshPayload;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || "",
      }) as RefreshPayload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (!decoded?.sub || !decoded?.jti || decoded.type !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.ensureRedisConnected();
    const reuseKey = this.getRefreshReuseKey(decoded.jti);
    const wasUsed = await this.redis.get(reuseKey);

    // SECURITY: refresh token reuse detection invalidates all sessions for the user.
    if (wasUsed) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId: decoded.sub },
      });

      this.securityLogger.log({
        eventType: "auth.refresh.reuse_detected",
        userId: decoded.sub,
        ip: getClientIp(req),
        result: "blocked",
      });

      throw new UnauthorizedException("Refresh token reuse detected. All sessions revoked.");
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId: decoded.sub },
      });
      this.securityLogger.log({
        eventType: "auth.refresh.reuse_detected",
        userId: decoded.sub,
        ip: getClientIp(req),
        result: "blocked",
      });
      throw new UnauthorizedException("Refresh token reuse detected. All sessions revoked.");
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException("Refresh token expired");
    }

    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const ttlSeconds = Math.max(
      1,
      decoded.exp
        ? decoded.exp - Math.floor(Date.now() / 1000)
        : this.parseDurationSeconds(process.env.JWT_REFRESH_EXPIRES_IN || "7d", 7 * 24 * 60 * 60),
    );
    await this.redis.set(reuseKey, "1", "EX", ttlSeconds);

    const tokens = await this.generateTokens(storedToken.user, req);

    this.securityLogger.log({
      eventType: "auth.refresh.success",
      userId: storedToken.userId,
      ip: getClientIp(req),
      result: "success",
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.excludePassword(storedToken.user),
    };
  }

  async logout(refreshToken: string, req: Request) {
    try {
      if (refreshToken) {
        await this.prisma.refreshToken.delete({
          where: { token: refreshToken },
        });
      }
    } catch {
      // Token may already be deleted — ignore
    }

    this.securityLogger.log({
      eventType: "auth.logout",
      ip: getClientIp(req),
      result: "success",
    });

    return { message: "Logged out successfully" };
  }

  async logoutAllSessions(userId: string, req: Request) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    this.securityLogger.log({
      eventType: "auth.logout_all",
      userId,
      ip: getClientIp(req),
      result: "success",
    });

    return { message: "Logged out from all sessions" };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.excludePassword(user);
  }

  private excludePassword<T extends { password: string }>(
    user: T,
  ): Omit<T, "password"> {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
