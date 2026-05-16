import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { VmController } from "./vm.controller";
import { VmService } from "./vm.service";
import { VmEventsGateway } from "./vm-events.gateway";
import { VncGateway } from "./vnc.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "",
    }),
  ],
  controllers: [VmController],
  providers: [VmService, VmEventsGateway, VncGateway],
  exports: [VmService],
})
export class VmModule {}
