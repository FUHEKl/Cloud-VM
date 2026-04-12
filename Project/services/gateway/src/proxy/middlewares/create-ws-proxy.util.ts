import { Response } from "express";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";

interface WsProxyOptions {
  target: string;
  errorLabel: string;
  unavailableMessage: string;
}

export function createWsProxy({
  target,
  errorLabel,
  unavailableMessage,
}: WsProxyOptions): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    onError: (err, _req, res) => {
      console.error(`${errorLabel} proxy error:`, err.message);
      if (res && typeof (res as Response).headersSent !== "undefined") {
        const response = res as Response;
        if (!response.headersSent) {
          response.status(502).json({
            statusCode: 502,
            message: unavailableMessage,
          });
        }
      }
    },
  }) as RequestHandler;
}
