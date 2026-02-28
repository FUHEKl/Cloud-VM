import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

@Injectable()
export class PlanProxyMiddleware implements NestMiddleware {
  private proxy = createProxyMiddleware({
    target: process.env.VM_SERVICE_URL || "http://localhost:3004",
    changeOrigin: true,
    pathRewrite: {
      "^/api/plans": "/plans",
    },
    onError: (err, req, res) => {
      console.error("Plan proxy error:", err.message);
      (res as Response).status(502).json({
        statusCode: 502,
        message: "VM service unavailable",
      });
    },
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
