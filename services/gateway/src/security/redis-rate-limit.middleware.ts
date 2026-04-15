import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import Redis from "ioredis";

interface RateLimitRule {
  name: string;
  method: string;
  path: RegExp;
  limit: number;
  windowSeconds: number;
}

@Injectable()
export class RedisRateLimitMiddleware implements NestMiddleware {
  private readonly redis = new Redis(
    process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`,
    {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    },
  );

  private readonly defaultRule: RateLimitRule = {
    name: "default",
    method: "*",
    path: /^\/api\//,
    limit: 60,
    windowSeconds: 60,
  };

  private readonly strictRules: RateLimitRule[] = [
    {
      name: "auth-login",
      method: "POST",
      path: /^\/api\/auth\/login$/,
      limit: 10,
      windowSeconds: 60,
    },
    {
      name: "auth-register",
      method: "POST",
      path: /^\/api\/auth\/register$/,
      limit: 5,
      windowSeconds: 60,
    },
    {
      name: "auth-mfa-verify",
      method: "POST",
      path: /^\/api\/auth\/mfa\/verify$/,
      limit: 8,
      windowSeconds: 60,
    },
    {
      name: "ai-chat",
      method: "POST",
      path: /^\/api\/ai\/chat$/,
      limit: 20,
      windowSeconds: 60,
    },
  ];

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim().replace("::ffff:", "");
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].trim().replace("::ffff:", "");
    }
    return (req.ip || req.socket.remoteAddress || "unknown").replace("::ffff:", "");
  }

  private resolveRule(req: Request): RateLimitRule | null {
    const method = req.method.toUpperCase();
    const path = req.path;

    for (const rule of this.strictRules) {
      if (rule.method === method && rule.path.test(path)) {
        return rule;
      }
    }

    if (this.defaultRule.path.test(path)) {
      return this.defaultRule;
    }

    return null;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const rule = this.resolveRule(req);
    if (!rule) {
      next();
      return;
    }

    if (this.redis.status !== "ready") {
      await this.redis.connect();
    }

    const ip = this.getClientIp(req);
    const key = `security:gateway:ratelimit:${rule.name}:${ip}`;

    const currentHits = await this.redis.incr(key);
    if (currentHits === 1) {
      await this.redis.expire(key, rule.windowSeconds);
    }

    if (currentHits > rule.limit) {
      const ttl = Math.max(1, await this.redis.ttl(key));

      // SECURITY: explicit Retry-After header for bounded client backoff behavior.
      res.setHeader("Retry-After", String(ttl));

      // SECURITY: structured rate-limit audit log without sensitive payload data.
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          eventType: "rate_limit.hit",
          ip,
          method: req.method,
          path: req.path,
          result: "blocked",
          limit: rule.limit,
          windowSeconds: rule.windowSeconds,
          retryAfterSeconds: ttl,
        }),
      );

      res.status(429).json({
        statusCode: 429,
        message: "Too many requests. Please retry later.",
      });
      return;
    }

    next();
  }
}
