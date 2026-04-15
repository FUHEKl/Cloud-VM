import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { UserInternalController } from "./user-internal.controller";

@Module({
  controllers: [UserController, UserInternalController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
