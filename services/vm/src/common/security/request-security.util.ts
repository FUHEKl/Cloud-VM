import { createHash } from "crypto";
import type { Request } from "express";

function normalizeIp(rawIp?: string): string {
  if (!rawIp) return "unknown";
  const normalized = rawIp.replace("::ffff:", "").trim();
  if (normalized === "::1" || normalized === "127.0.0.1") {
    return "127.0.0.1";
  }
  return normalized;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value.trim() || null;
}

export function getClientIp(req: Request): string {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  const realIp = firstHeaderValue(req.headers["x-real-ip"]);

  const rawIp =
    (forwardedFor ? forwardedFor.split(",")[0] : null) ||
    realIp ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  return normalizeIp(rawIp);
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
