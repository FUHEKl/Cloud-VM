import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

@Injectable()
export class AuthOauthProxyMiddleware implements NestMiddleware {
  private proxy = createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || "http://localhost:3002",
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { "^/api/auth": "/auth" },
    onError: (_err, _req, res) => {
      console.error("Auth OAuth proxy error");
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
