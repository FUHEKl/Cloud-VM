import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class AiProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.AI_SERVICE_URL || "http://localhost:3006",
    pathRewrite: { "^/api/ai": "/ai" },
    errorLabel: "AI",
    unavailableMessage: "AI service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
