import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { UserInternalController } from "./user-internal.controller";
import { EmailService } from "../common/email/email.service";

@Module({
  controllers: [UserController, UserInternalController],
  providers: [UserService, EmailService],
  exports: [UserService],
})
export class UserModule {}
