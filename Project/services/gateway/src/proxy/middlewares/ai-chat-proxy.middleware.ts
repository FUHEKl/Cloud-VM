import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { RequestHandler } from "http-proxy-middleware";
import { createWsProxy } from "./create-ws-proxy.util";

const target = process.env.AI_SERVICE_URL || "http://localhost:3006";

/**
 * Proxy for AI chat Socket.IO namespace (/ai-chat/socket.io).
 *
 * Exported as a singleton so gateway/main.ts can attach `.upgrade`
 * to the raw HTTP server for WebSocket upgrades.
 */
export const aiChatProxyInstance = createWsProxy({
  target,
  errorLabel: "AI-Chat",
  unavailableMessage: "AI chat service unavailable",
}) as RequestHandler;

@Injectable()
export class AiChatProxyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    aiChatProxyInstance(req, res, next);
  }
}