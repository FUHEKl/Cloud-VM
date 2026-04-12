import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { ChatRequestDto } from "./dto/chat.dto";
import { AiService } from "./ai.service";
import { createHash } from "crypto";

interface CurrentUserShape {
  userId: string;
  email: string;
  role: string;
}

interface AiChatPayload {
  requestId?: string;
  message: string;
  conversationId?: string;
  includeContext?: boolean;
  images?: string[];
}

function extractCookieValue(rawCookie: string | undefined, cookieName: string): string | undefined {
  if (!rawCookie) return undefined;
  const parts = rawCookie.split(";");
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return undefined;
}

function buildSocketFingerprint(client: Socket): string {
  const ip =
    (typeof client.handshake.headers["x-forwarded-for"] === "string"
      ? client.handshake.headers["x-forwarded-for"].split(",")[0].trim()
      : client.handshake.address || "unknown"
    ).replace("::ffff:", "");
  const userAgent =
    (typeof client.handshake.headers["user-agent"] === "string"
      ? client.handshake.headers["user-agent"]
      : "unknown"
    ).trim();
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

const aiCorsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: aiCorsOrigins,
    credentials: true,
  },
  namespace: "/ai-chat",
  path: "/ai-chat/socket.io",
  maxHttpBufferSize: 8e6,
})
export class AiChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AiChatGateway.name);
  private readonly eventRateWindowStats = new Map<
    string,
    { windowStartMs: number; countInWindow: number }
  >();
  private readonly maxEventsPerSecond = 2;

  constructor(
    private readonly jwtService: JwtService,
    private readonly aiService: AiService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "") ||
        extractCookieValue(client.handshake.headers?.cookie, "accessToken");

      if (!token) {
        this.logger.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            eventType: "websocket.auth.failure",
            socketId: client.id,
            namespace: "ai-chat",
            result: "denied",
            reason: "missing_token",
          }),
        );
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        sub: string;
        email: string;
        role: string;
        fp?: string;
      };

      // SECURITY: enforce fingerprint binding for websocket AI sessions.
      if (!payload.fp || payload.fp !== buildSocketFingerprint(client)) {
        throw new Error("Token fingerprint mismatch");
      }

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      } as CurrentUserShape;

      this.logger.log(`AI socket connected: ${client.id} user=${payload.sub}`);
    } catch {
      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          eventType: "websocket.auth.failure",
          socketId: client.id,
          namespace: "ai-chat",
          result: "denied",
          reason: "invalid_token",
        }),
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.eventRateWindowStats.delete(client.id);
    this.logger.log(`AI socket disconnected: ${client.id}`);
  }

  @SubscribeMessage("ai:chat")
  async handleAiChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AiChatPayload,
  ) {
    const requestId =
      payload.requestId || `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const user = client.data.user as CurrentUserShape | undefined;
    if (!user) {
      client.emit("ai:error", {
        requestId,
        message: "Unauthorized socket session",
      });
      return;
    }

    if (!payload?.message || typeof payload.message !== "string") {
      client.emit("ai:error", {
        requestId,
        message: "Message is required",
      });
      return;
    }

    if (!this.allowEventRate(client.id)) {
      client.emit("ai:error", {
        requestId,
        message: "Too many chat messages. Maximum 2 messages per second.",
      });
      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          eventType: "websocket.rate_limit.hit",
          socketId: client.id,
          namespace: "ai-chat",
          result: "blocked",
          limit: this.maxEventsPerSecond,
        }),
      );
      client.disconnect();
      return;
    }

    try {
      const dto: ChatRequestDto = {
        message: payload.message,
        conversationId: payload.conversationId,
        includeContext: payload.includeContext,
        images: payload.images,
      };

      const result = await this.aiService.chat(user, dto);

      client.emit("ai:meta", {
        requestId,
        conversationId: result.conversationId,
        messageId: result.message.id,
        provider: result.message.provider,
        model: result.message.model,
        pendingAction: result.pendingAction,
      });

      for (const token of result.message.content.split(/(\s+)/).filter(Boolean)) {
        client.emit("ai:chunk", { requestId, token });
      }

      client.emit("ai:done", { requestId });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process AI chat over WebSocket";

      client.emit("ai:error", {
        requestId,
        message,
      });
    }
  }

  private allowEventRate(clientId: string): boolean {
    const now = Date.now();
    const current = this.eventRateWindowStats.get(clientId);

    if (!current || now - current.windowStartMs >= 1000) {
      this.eventRateWindowStats.set(clientId, {
        windowStartMs: now,
        countInWindow: 1,
      });
      return true;
    }

    current.countInWindow += 1;
    return current.countInWindow <= this.maxEventsPerSecond;
  }
}
