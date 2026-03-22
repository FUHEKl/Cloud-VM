import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { VmController } from "./vm.controller";
import { VmService } from "./vm.service";
import { VmEventsGateway } from "./vm-events.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "super-secret-key",
    }),
  ],
  controllers: [VmController],
  providers: [VmService, VmEventsGateway],
  exports: [VmService],
})
export class VmModule {}
