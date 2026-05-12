import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RequestHandler } from "http-proxy-middleware";
import { createWsProxy } from "./create-ws-proxy.util";

const target = process.env.VM_SERVICE_URL || "http://localhost:3004";

/**
 * Proxy for the VNC Socket.IO namespace (/vnc/socket.io).
 */
export const vncProxyInstance = createWsProxy({
  target,
  errorLabel: "VNC",
  unavailableMessage: "VNC service unavailable",
}) as RequestHandler;

@Injectable()
export class VncProxyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    vncProxyInstance(req, res, next);
  }
}
