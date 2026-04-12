import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class TerminalApiProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.VM_SERVICE_URL || "http://localhost:3004",
    pathRewrite: { "^/api/terminal": "/terminal" },
    errorLabel: "Terminal API",
    unavailableMessage: "Terminal service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}