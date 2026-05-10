import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import {
  buildRequestFingerprint,
  parseCookie,
} from "../security/request-security.util";

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  fp?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    const jwtSecret = (process.env.JWT_SECRET || "").trim();
    if (!jwtSecret || jwtSecret.length < 64) {
      throw new Error("JWT_SECRET is missing or too weak for VM service");
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => parseCookie(req, "accessToken") || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    // SECURITY: reject JWT replay from mismatched client fingerprint.
    const expected = buildRequestFingerprint(req);
    if (!payload.fp || payload.fp !== expected) {
      throw new UnauthorizedException("Token fingerprint mismatch");
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
