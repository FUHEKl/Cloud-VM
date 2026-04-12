import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class AuthProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.AUTH_SERVICE_URL || "http://localhost:3002",
    pathRewrite: { "^/api/auth": "/auth" },
    errorLabel: "Auth",
    unavailableMessage: "Auth service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
