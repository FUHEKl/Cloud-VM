import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RequestHandler } from "http-proxy-middleware";
import { createWsProxy } from "./create-ws-proxy.util";

const target = process.env.VM_SERVICE_URL || "http://localhost:3004";

/**
 * Proxy for the VM-Events Socket.IO namespace (/vm-events/socket.io).
 *
 * The proxy instance is exported as a module-level singleton so that
 * gateway/main.ts can attach its `.upgrade` handler to the raw HTTP server
 * (required by http-proxy-middleware v2 for WebSocket upgrades).
 */
export const vmEventsProxyInstance = createWsProxy({
  target,
  errorLabel: "VM-Events",
  unavailableMessage: "VM events service unavailable",
}) as RequestHandler;

@Injectable()
export class VmEventsProxyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    vmEventsProxyInstance(req, res, next);
  }
}
