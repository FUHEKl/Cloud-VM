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

@Module({})
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthProxyMiddleware)
      .forRoutes(
        { path: "api/auth", method: RequestMethod.ALL },
        { path: "api/auth/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(UserProxyMiddleware)
      .forRoutes(
        { path: "api/users", method: RequestMethod.ALL },
        { path: "api/users/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(SshKeyProxyMiddleware)
      .forRoutes(
        { path: "api/ssh-keys", method: RequestMethod.ALL },
        { path: "api/ssh-keys/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(VmProxyMiddleware)
      .forRoutes(
        { path: "api/vms", method: RequestMethod.ALL },
        { path: "api/vms/*", method: RequestMethod.ALL },
      );

    consumer
      .apply(PlanProxyMiddleware)
      .forRoutes(
        { path: "api/plans", method: RequestMethod.ALL },
        { path: "api/plans/*", method: RequestMethod.ALL },
      );
  }
}
