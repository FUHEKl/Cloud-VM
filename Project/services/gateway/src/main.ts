import "./env";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response, json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { terminalProxyInstance } from "./proxy/middlewares/terminal-proxy.middleware";
import { vmEventsProxyInstance } from "./proxy/middlewares/vm-events-proxy.middleware";
import { aiChatProxyInstance } from "./proxy/middlewares/ai-chat-proxy.middleware";

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

function parseHost(value?: string): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first ? first.toLowerCase() : null;
}

function parseSingleHeader(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value.trim() || null;
}

function getTrustedHosts(allowedOrigins: string[]): Set<string> {
  const hosts = new Set<string>();

  for (const origin of allowedOrigins) {
    try {
      hosts.add(new URL(origin).host.toLowerCase());
    } catch {
      // Ignore malformed origin values; they are handled by CORS elsewhere.
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
  hosts.add("localhost:3001");
  hosts.add("127.0.0.1:3001");

  return hosts;
}

async function bootstrap() {
  validateJwtSecretsOrThrow();

  // SECURITY: If app is compromised while running as root, attacker gets full server access.
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    throw new Error("SECURITY: Do not run as root. Exiting.");
  }

  if (process.env.NODE_ENV === "production") {
    console.log(`SECURITY: running process uid=${typeof process.getuid === "function" ? process.getuid() : "unknown"}`);
  }

  const app = await NestFactory.create(AppModule);

  // SECURITY: 12mb allows memory exhaustion attacks.
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

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
  const trustedHosts = getTrustedHosts(allowedOrigins);
  const edgeProxyToken = (process.env.EDGE_PROXY_TOKEN || "").trim();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const forwardedProto = parseSingleHeader(req.headers["x-forwarded-proto"]);
    const edgeToken = parseSingleHeader(req.headers["x-edge-token"]);

    // SECURITY: requests coming through the public edge must indicate HTTPS.
    if (forwardedProto && forwardedProto !== "https") {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid forwarded proto",
        error: "Bad Request",
      });
    }

    // SECURITY: optional shared secret to reject direct gateway access bypassing edge.
    if (edgeProxyToken) {
      if (!edgeToken || edgeToken !== edgeProxyToken) {
        return res.status(403).json({
          statusCode: 403,
          message: "Edge verification failed",
          error: "Forbidden",
        });
      }
    }

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
      const edgeToken = parseSingleHeader(req.headers?.["x-edge-token"]);
      if (edgeProxyToken && edgeToken !== edgeProxyToken) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

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
