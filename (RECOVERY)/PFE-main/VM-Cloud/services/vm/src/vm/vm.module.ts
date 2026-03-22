import { Module } from "@nestjs/common";
import { VmController } from "./vm.controller";
import { VmService } from "./vm.service";

@Module({
  controllers: [VmController],
  providers: [VmService],
  exports: [VmService],
})
export class VmModule {}
