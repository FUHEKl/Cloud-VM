import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

@Injectable()
export class AuthProxyMiddleware implements NestMiddleware {
  private proxy = createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || "http://localhost:3002",
    changeOrigin: true,
    pathRewrite: {
      "^/api/auth": "/auth",
    },
    onError: (err, req, res) => {
      console.error("Auth proxy error:", err.message);
      (res as Response).status(502).json({
        statusCode: 502,
        message: "Auth service unavailable",
      });
    },
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
