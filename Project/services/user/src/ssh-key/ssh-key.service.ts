import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSshKeyDto } from "./dto/create-ssh-key.dto";
import * as crypto from "crypto";

@Injectable()
export class SshKeyService {
  constructor(private readonly prisma: PrismaService) {}

  private generateFingerprint(publicKey: string): string {
    try {
      const parts = publicKey.trim().split(/\s+/);
      if (parts.length < 2) {
        throw new BadRequestException("Invalid SSH public key format");
      }

      const keyData = Buffer.from(parts[1], "base64");
      const hash = crypto.createHash("md5").update(keyData).digest("hex");

      // Format as colon-separated hex pairs
      return hash.match(/.{2}/g)!.join(":");
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException("Invalid SSH public key");
    }
  }

  async findAllByUser(userId: string) {
    return this.prisma.sshKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(userId: string, dto: CreateSshKeyDto) {
    const fingerprint = this.generateFingerprint(dto.publicKey);

    return this.prisma.sshKey.create({
      data: {
        name: dto.name,
        publicKey: dto.publicKey,
        fingerprint,
        userId,
      },
    });
  }

  async delete(id: string, userId: string) {
    const sshKey = await this.prisma.sshKey.findUnique({
      where: { id },
    });

    if (!sshKey) {
      throw new NotFoundException("SSH key not found");
    }

    if (sshKey.userId !== userId) {
      throw new ForbiddenException("You do not own this SSH key");
    }

    await this.prisma.sshKey.delete({ where: { id } });

    return { message: "SSH key deleted successfully" };
  }
}
