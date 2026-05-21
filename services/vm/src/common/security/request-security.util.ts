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

export function getUserAgent(req: Request): string {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string" && ua.trim().length > 0) {
    return ua.trim();
  }
  return "unknown";
}

export function buildRequestFingerprint(req: Request): string {
  const raw = `${getClientIp(req)}|${getUserAgent(req)}`;
  // SECURITY: fingerprint claim binds token usage to source IP + user-agent.
  return createHash("sha256").update(raw).digest("hex");
}

export function parseCookie(req: Request, cookieName: string): string | undefined {
  const rawCookieHeader = req.headers.cookie;
  if (!rawCookieHeader) return undefined;

  const cookies = rawCookieHeader.split(";");
  for (const item of cookies) {
    const [name, ...valueParts] = item.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return undefined;
}
