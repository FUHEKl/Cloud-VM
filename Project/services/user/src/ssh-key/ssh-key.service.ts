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

  private base64UrlToBuffer(value: string): Buffer {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded = normalized + (pad ? "=".repeat(4 - pad) : "");
    return Buffer.from(padded, "base64");
  }

  private encodeSshField(data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, data]);
  }

  private encodeMpint(data: Buffer): Buffer {
    let value = data;
    while (value.length > 1 && value[0] === 0x00) {
      value = value.subarray(1);
    }
    if (value.length === 0) {
      value = Buffer.from([0]);
    }
    if ((value[0] & 0x80) !== 0) {
      value = Buffer.concat([Buffer.from([0]), value]);
    }
    return this.encodeSshField(value);
  }

  private buildSshRsaPublicKeyFromJwk(n: string, e: string): string {
    const keyType = Buffer.from("ssh-rsa", "utf8");
    const exponent = this.base64UrlToBuffer(e);
    const modulus = this.base64UrlToBuffer(n);

    const payload = Buffer.concat([
      this.encodeSshField(keyType),
      this.encodeMpint(exponent),
      this.encodeMpint(modulus),
    ]);

    return `ssh-rsa ${payload.toString("base64")}`;
  }

  private sanitizeKeyName(input: string): string {
    const base = (input || "generated-key")
      .trim()
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 48);
    return base.length > 0 ? base : "generated-key";
  }

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

  async generateAndCreate(userId: string, desiredName?: string) {
    const safeName = this.sanitizeKeyName(desiredName || "My Generated Key");

    const { publicKey, privateKey } = (crypto.generateKeyPairSync as any)("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: {
        format: "jwk",
      },
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs8",
      },
    });

    const jwk = publicKey as JsonWebKey;
    if (!jwk.n || !jwk.e) {
      throw new BadRequestException("Unable to generate SSH key pair");
    }

    const sshPublicKey = this.buildSshRsaPublicKeyFromJwk(jwk.n, jwk.e);
    const fingerprint = this.generateFingerprint(sshPublicKey);

    const created = await this.prisma.sshKey.create({
      data: {
        name: safeName,
        publicKey: sshPublicKey,
        fingerprint,
        userId,
      },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `cloudvm-${safeName}-${timestamp}.pem`;

    return {
      key: created,
      privateKey,
      filename,
      notice: "This private key is shown once. Save it securely now.",
    };
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
