import { Request, Response } from "express";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";
import { forwardParsedBody } from "./proxy-body.util";

interface JsonApiProxyOptions {
  target: string;
  pathRewrite: Record<string, string>;
  errorLabel: string;
  unavailableMessage: string;
}

export function createJsonApiProxy({
  target,
  pathRewrite,
  errorLabel,
  unavailableMessage,
}: JsonApiProxyOptions): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    xfwd: true,
    pathRewrite,
    onProxyReq: (proxyReq, req) => {
      forwardParsedBody(proxyReq, req as Request);
    },
    onError: (err, _req, res) => {
      console.error(`${errorLabel} proxy error:`, err.message);
      (res as Response).status(502).json({
        statusCode: 502,
        message: unavailableMessage,
      });
    },
  }) as RequestHandler;
}
