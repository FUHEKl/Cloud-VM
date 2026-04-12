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

  constructor(
    private readonly jwtService: JwtService,
    private readonly aiService: AiService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: missing token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        sub: string;
        email: string;
        role: string;
      };

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      } as CurrentUserShape;

      this.logger.log(`AI socket connected: ${client.id} user=${payload.sub}`);
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
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
}
