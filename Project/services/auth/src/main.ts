import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response, json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { validateJwtSecretsOrThrow } from "./common/security/startup-security.util";

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
