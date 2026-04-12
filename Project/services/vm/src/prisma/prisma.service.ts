import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // SECURITY: SQL-injection audit — this service uses Prisma ORM APIs only.
  // No unsafe raw SQL execution (`$queryRaw` / `$executeRaw`) is used here.
  async onModuleInit() {
    await this.$connect();
  }
}
