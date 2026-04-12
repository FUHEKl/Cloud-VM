import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: "12mb" }));
  app.use(urlencoded({ extended: true, limit: "12mb" }));

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

  const port = process.env.AI_PORT || 3006;
  await app.listen(port);
  console.log(`AI service running on port ${port}`);
}

bootstrap();
