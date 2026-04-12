import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { terminalProxyInstance } from "./proxy/middlewares/terminal-proxy.middleware";
import { vmEventsProxyInstance } from "./proxy/middlewares/vm-events-proxy.middleware";
import { aiChatProxyInstance } from "./proxy/middlewares/ai-chat-proxy.middleware";

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

  const port = process.env.PORT || 3001;
  await app.listen(port);

  // ─── WebSocket upgrade forwarding ────────────────────────────────────────
  //
  // http-proxy-middleware v2 does NOT automatically forward WebSocket upgrade
  // requests through Express middleware. We must attach the proxy's `.upgrade`
  // handler directly to the underlying Node.js HTTP server's 'upgrade' event.
  //
  // Without this, Socket.IO WebSocket connections are silently dropped by the
  // gateway — the client receives an HTTP 400/404 from Express instead of the
  // 101 Switching Protocols it expects.
  //
  // We attach both proxy upgrade handlers so the gateway correctly forwards:
  //   /terminal/socket.io  → VM service (in-browser SSH terminal)
  //   /vm-events/socket.io → VM service (real-time VM status events)
  //
  const httpServer = app.getHttpServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalUpgrade = (terminalProxyInstance as any).upgrade;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vmEventsUpgrade = (vmEventsProxyInstance as any).upgrade;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiChatUpgrade = (aiChatProxyInstance as any).upgrade;

  if (
    typeof terminalUpgrade === "function" ||
    typeof vmEventsUpgrade === "function" ||
    typeof aiChatUpgrade === "function"
  ) {
    httpServer.on("upgrade", (req: any, socket: any, head: any) => {
      const url: string = req.url ?? "";
      if (url.startsWith("/terminal/") && typeof terminalUpgrade === "function") {
        terminalUpgrade(req, socket, head);
      } else if (
        url.startsWith("/vm-events/") &&
        typeof vmEventsUpgrade === "function"
      ) {
        vmEventsUpgrade(req, socket, head);
      } else if (url.startsWith("/ai-chat/") && typeof aiChatUpgrade === "function") {
        aiChatUpgrade(req, socket, head);
      }
    });

    const registeredPaths: string[] = [];
    if (typeof terminalUpgrade === "function") registeredPaths.push("/terminal/");
    if (typeof vmEventsUpgrade === "function") registeredPaths.push("/vm-events/");
    if (typeof aiChatUpgrade === "function") registeredPaths.push("/ai-chat/");

    console.log(
      `WebSocket upgrade handlers registered for ${registeredPaths.join(", ")}`,
    );
  } else {
    console.warn(
      "WARNING: proxy.upgrade is not a function — WebSocket proxying may not work. " +
      "Check your http-proxy-middleware version.",
    );
  }

  console.log(`API Gateway is running on port ${port}`);
}

bootstrap();
