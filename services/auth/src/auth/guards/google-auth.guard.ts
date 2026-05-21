import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  private shouldUseSecureCookies(req: Request): boolean {
    const policy = (process.env.AUTH_COOKIE_SECURE || "auto").toLowerCase();

    if (policy === "true") return true;
    if (policy === "false") return false;

    const forwardedProto = req.headers["x-forwarded-proto"];
    const forwardedProtoValue = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;

    // auto: secure on HTTPS requests/proxies, non-secure on plain localhost HTTP.
    return req.secure || forwardedProtoValue === "https";
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const path = req.path || req.url || "";
    const isCallback = path.includes("/google/callback");

    if (!isCallback) {
      const intent = req.query?.intent === "register" ? "register" : "login";
      const secure = this.shouldUseSecureCookies(req);

      res.cookie("google_intent", intent, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
      });
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
