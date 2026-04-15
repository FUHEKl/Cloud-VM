import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response, json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

const DEFAULT_SECRET_MARKERS = [
  "super-secret-key",
  "super-secret-jwt-key-change-in-production",
  "super-secret-refresh-key-change-in-production",
  "change-in-production",
];

function isWeakSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return DEFAULT_SECRET_MARKERS.some((marker) => lowered.includes(marker));
}

function validateJwtSecretsOrThrow() {
  const jwtSecret = process.env.JWT_SECRET || "";
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";

  // SECURITY: Prevents accidental deployment with weak or default secrets.
  if (jwtSecret.length < 64 || isWeakSecret(jwtSecret)) {
    throw new Error("JWT_SECRET is weak. Use at least 64 chars and never default placeholders.");
  }

  // SECURITY: Prevents accidental deployment with weak or default secrets.
  if (jwtRefreshSecret.length < 64 || isWeakSecret(jwtRefreshSecret)) {
    throw new Error(
      "JWT_REFRESH_SECRET is weak. Use at least 64 chars and never default placeholders.",
    );
  }

  console.log("SECURITY: JWT secret validation passed");
}

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  validateJwtSecretsOrThrow();

  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: "512kb" }));
  app.use(urlencoded({ extended: true, limit: "512kb" }));

  app.use(
    // SECURITY: baseline hardening headers to reduce browser-side attack surface.
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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`User service running on port ${port}`);
}

bootstrap();
