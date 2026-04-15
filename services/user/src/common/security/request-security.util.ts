import { createHash } from "crypto";
import type { Request } from "express";

function normalizeIp(rawIp?: string): string {
  if (!rawIp) return "unknown";
  return rawIp.replace("::ffff:", "").trim();
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return normalizeIp(forwardedFor.split(",")[0]);
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return normalizeIp(forwardedFor[0]);
  }
  return normalizeIp(req.ip || req.socket.remoteAddress || "unknown");
}

export function buildRequestFingerprint(req: Request): string {
  const userAgent = typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"]
    : "unknown";
  // SECURITY: fingerprint binds JWT usage to originating client context.
  return createHash("sha256").update(`${getClientIp(req)}|${userAgent}`).digest("hex");
}

export function parseCookie(req: Request, cookieName: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return undefined;
}
