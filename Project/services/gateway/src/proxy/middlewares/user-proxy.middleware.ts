import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class UserProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.USER_SERVICE_URL || "http://localhost:3003",
    pathRewrite: { "^/api/users": "/users" },
    errorLabel: "User",
    unavailableMessage: "User service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
