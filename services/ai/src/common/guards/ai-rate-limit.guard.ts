import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs = 60_000;
  private readonly maxRequests = Math.max(
    1,
    Number(process.env.AI_RATE_LIMIT_PER_MIN || "20"),
  );

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId || req.ip || "anonymous";
    const now = Date.now();

    const previous = this.hits.get(userId) || [];
    const recent = previous.filter((ts) => now - ts <= this.windowMs);

    if (recent.length >= this.maxRequests) {
      throw new HttpException(
        "Too many AI requests. Please retry in a moment.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }
}
