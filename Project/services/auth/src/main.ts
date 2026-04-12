import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response, json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { validateJwtSecretsOrThrow } from "./common/security/startup-security.util";
import { parseCookie } from "./common/security/request-security.util";

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function buildTrustedOrigins(req: Request, allowedOrigins: string[]): Set<string> {
  const trusted = new Set<string>();

  for (const origin of allowedOrigins) {
    const normalized = normalizeOrigin(origin);
    if (normalized) trusted.add(normalized);
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || req.protocol || "http";

  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;

  if (host) {
    trusted.add(`${proto}://${host}`);
  }

  return trusted;
}

async function bootstrap() {
  validateJwtSecretsOrThrow();

  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  app.use(
    // SECURITY: baseline hardening headers to reduce common browser attack surface.
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
        },
      },
      frameguard: { action: "deny" },
      noSniff: true,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    // SECURITY: explicit permissions policy header.
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.getHttpAdapter().getInstance().disable("x-powered-by");

  const allowedOrigins = getAllowedOrigins();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const unsafeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
    if (!unsafeMethod) return next();

    const hasSessionCookie = Boolean(
      parseCookie(req, "accessToken") || parseCookie(req, "refreshToken"),
    );
    if (!hasSessionCookie) return next();

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    const rawOrigin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const rawReferer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;

    const requestOrigin = normalizeOrigin(rawOrigin) || normalizeOrigin(rawReferer);

    // Compatibility: allow non-browser clients that do not send Origin/Referer.
    if (!requestOrigin) return next();

    const trustedOrigins = buildTrustedOrigins(req, allowedOrigins);
    if (trustedOrigins.has(requestOrigin)) return next();

    return res.status(403).json({
      statusCode: 403,
      message: "Request origin is not allowed",
      error: "Forbidden",
    });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Auth service running on port ${port}`);
}

bootstrap();
