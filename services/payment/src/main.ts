import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { Request, Response, json, raw, urlencoded } from "express";

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use("/payments/webhook", raw({ type: "application/json" }));
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.getHttpAdapter().getInstance().disable("x-powered-by");

  app.getHttpAdapter().getInstance().get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`Payment service running on port ${port}`);
}

bootstrap();