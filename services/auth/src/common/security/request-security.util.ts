import { createHash } from "crypto";
import type { Request } from "express";

function normalizeIp(rawIp?: string): string {
  if (!rawIp) return "unknown";
  return rawIp.replace("::ffff:", "").trim();
}

export function getClientIp(req: Request): string {
  return normalizeIp(req.ip || req.socket.remoteAddress || "unknown");
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
