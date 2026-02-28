import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

@Injectable()
export class UserProxyMiddleware implements NestMiddleware {
  private proxy = createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || "http://localhost:3003",
    changeOrigin: true,
    pathRewrite: {
      "^/api/users": "/users",
    },
    onError: (err, req, res) => {
      console.error("User proxy error:", err.message);
      (res as Response).status(502).json({
        statusCode: 502,
        message: "User service unavailable",
      });
    },
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.proxy(req, res, next);
  }
}
