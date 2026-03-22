import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { forwardParsedBody } from "./proxy-body.util";

@Injectable()
export class VmProxyMiddleware implements NestMiddleware {
  private proxy = createProxyMiddleware({
    target: process.env.VM_SERVICE_URL || "http://localhost:3004",
    changeOrigin: true,
    pathRewrite: {
      "^/api/vms": "/vms",
    },
    onProxyReq: (proxyReq, req) => {
      forwardParsedBody(proxyReq, req as Request);
    },
    onError: (err, req, res) => {
      console.error("VM proxy error:", err.message);
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
