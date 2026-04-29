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

function parseHost(value?: string): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first ? first.toLowerCase() : null;
}

function getTrustedHosts(allowedOrigins: string[]): Set<string> {
  const hosts = new Set<string>();

  for (const origin of allowedOrigins) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) continue;

    try {
      hosts.add(new URL(normalized).host.toLowerCase());
    } catch {
      // Ignore malformed entries.
    }
  }

  const extraHosts = (process.env.TRUSTED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  for (const host of extraHosts) {
    hosts.add(host);
  }

  hosts.add("localhost");
  hosts.add("127.0.0.1");
  hosts.add("localhost:3002");
  hosts.add("127.0.0.1:3002");
  hosts.add("localhost:3001");
  hosts.add("127.0.0.1:3001");

  return hosts;
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
  const trustedHosts = getTrustedHosts(allowedOrigins);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = parseHost(
      Array.isArray(req.headers["x-forwarded-host"])
        ? req.headers["x-forwarded-host"][0]
        : (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host,
    );

    if (!host || trustedHosts.has(host)) return next();

    return res.status(400).json({
      statusCode: 400,
      message: "Invalid host header",
      error: "Bad Request",
    });
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
