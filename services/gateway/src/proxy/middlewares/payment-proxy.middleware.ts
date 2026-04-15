import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { createJsonApiProxy } from "./create-json-api-proxy.util";

@Injectable()
export class PaymentProxyMiddleware implements NestMiddleware {
  private proxy = createJsonApiProxy({
    target: process.env.PAYMENT_SERVICE_URL || "http://payment:3005",
    pathRewrite: { "^/api/payments": "/payments" },
    errorLabel: "Payment",
    unavailableMessage: "Payment service unavailable",
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}