import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RequestHandler } from "http-proxy-middleware";
import { createWsProxy } from "./create-ws-proxy.util";

const target = process.env.VM_SERVICE_URL || "http://localhost:3004";

/**
 * Proxy for the terminal Socket.IO namespace (/terminal/socket.io).
 *
 * The proxy instance is exported as a module-level singleton so that
 * gateway/main.ts can attach its `.upgrade` handler to the raw HTTP server
 * (required by http-proxy-middleware v2 for WebSocket upgrades).
 */
export const terminalProxyInstance = createWsProxy({
  target,
  errorLabel: "Terminal",
  unavailableMessage: "Terminal service unavailable",
}) as RequestHandler;

@Injectable()
export class TerminalProxyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    terminalProxyInstance(req, res, next);
  }
}
