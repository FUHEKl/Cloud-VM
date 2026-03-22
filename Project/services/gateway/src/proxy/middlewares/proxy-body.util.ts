import { Request } from "express";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function forwardParsedBody(proxyReq: any, req: Request) {
  if (!req.method || !METHODS_WITH_BODY.has(req.method.toUpperCase())) {
    return;
  }

  const body = req.body;
  if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
    return;
  }

  const bodyData = typeof body === "string" ? body : JSON.stringify(body);

  proxyReq.setHeader("Content-Type", "application/json");
  proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
}
