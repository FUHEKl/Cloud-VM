import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class SshKeyProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.USER_SERVICE_URL || "http://localhost:3003",
    pathRewrite: { "^/api/ssh-keys": "/ssh-keys" },
    errorLabel: "SSH Key",
    unavailableMessage: "User service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
