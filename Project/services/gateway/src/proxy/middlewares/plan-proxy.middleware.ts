import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class PlanProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.VM_SERVICE_URL || "http://localhost:3004",
    pathRewrite: { "^/api/plans": "/plans" },
    errorLabel: "Plan",
    unavailableMessage: "VM service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
