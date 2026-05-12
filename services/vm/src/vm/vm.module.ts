import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { VmController } from "./vm.controller";
import { VmCallbackController } from "./vm-callback.controller";
import { VmService } from "./vm.service";
import { VmEventsGateway } from "./vm-events.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
    }),
  ],
  controllers: [VmController, VmCallbackController],
  providers: [VmService, VmEventsGateway],
  exports: [VmService],
})
export class VmModule {}
