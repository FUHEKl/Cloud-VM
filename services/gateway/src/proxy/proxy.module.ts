import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { AuthProxyMiddleware } from "./middlewares/auth-proxy.middleware";
import { UserProxyMiddleware } from "./middlewares/user-proxy.middleware";
import { SshKeyProxyMiddleware } from "./middlewares/ssh-key-proxy.middleware";
import { VmProxyMiddleware } from "./middlewares/vm-proxy.middleware";
import { PlanProxyMiddleware } from "./middlewares/plan-proxy.middleware";
import { TerminalProxyMiddleware } from "./middlewares/terminal-proxy.middleware";
import { TerminalApiProxyMiddleware } from "./middlewares/terminal-api-proxy.middleware";
import { VmEventsProxyMiddleware } from "./middlewares/vm-events-proxy.middleware";
import { AiProxyMiddleware } from "./middlewares/ai-proxy.middleware";
import { AiChatProxyMiddleware } from "./middlewares/ai-chat-proxy.middleware";
import { PaymentProxyMiddleware } from "./middlewares/payment-proxy.middleware";
import { RedisRateLimitMiddleware } from "../security/redis-rate-limit.middleware";

@Module({})
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RedisRateLimitMiddleware, AuthProxyMiddleware)
      .forRoutes(
        { path: "api/auth", method: RequestMethod.ALL },
        { path: "api/auth/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, UserProxyMiddleware)
      .forRoutes(
        { path: "api/users", method: RequestMethod.ALL },
        { path: "api/users/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, SshKeyProxyMiddleware)
      .forRoutes(
        { path: "api/ssh-keys", method: RequestMethod.ALL },
        { path: "api/ssh-keys/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, VmProxyMiddleware)
      .forRoutes(
        { path: "api/vms", method: RequestMethod.ALL },
        { path: "api/vms/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, PlanProxyMiddleware)
      .forRoutes(
        { path: "api/plans", method: RequestMethod.ALL },
        { path: "api/plans/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, PaymentProxyMiddleware)
      .forRoutes(
        { path: "api/payments", method: RequestMethod.ALL },
        { path: "api/payments/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(TerminalProxyMiddleware)
      .forRoutes(
        { path: "terminal/socket.io", method: RequestMethod.ALL },
        { path: "terminal/socket.io/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, TerminalApiProxyMiddleware)
      .forRoutes(
        { path: "api/terminal", method: RequestMethod.ALL },
        { path: "api/terminal/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(RedisRateLimitMiddleware, AiProxyMiddleware)
      .forRoutes(
        { path: "api/ai", method: RequestMethod.ALL },
        { path: "api/ai/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(AiChatProxyMiddleware)
      .forRoutes(
        { path: "ai-chat/socket.io", method: RequestMethod.ALL },
        { path: "ai-chat/socket.io/*", method: RequestMethod.ALL },
      );

    // VM-Events WebSocket namespace — real-time VM status updates
    // The VmEventsGateway uses path "/vm-events/socket.io" so it is distinct
    // from the terminal proxy path and the default /socket.io path.
    consumer
      .apply(VmEventsProxyMiddleware)
      .forRoutes(
        { path: "vm-events/socket.io", method: RequestMethod.ALL },
        { path: "vm-events/socket.io/*", method: RequestMethod.ALL },
      );
  }
}
