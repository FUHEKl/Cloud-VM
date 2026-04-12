import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import * as bcrypt from "bcrypt";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdminRole(actorRole?: string) {
    // SECURITY: Defense in depth — service-level check is independent of gateway.
    if (actorRole !== "ADMIN") {
      throw new ForbiddenException("Admin role required");
    }
  }

  private excludePassword(user: any) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.excludePassword(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Email already in use");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    return this.excludePassword(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const isPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: "Password changed successfully" };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    actorRole?: string,
  ) {
    this.assertAdminRole(actorRole);
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { quota: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.excludePassword(user)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, actorRole?: string) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        quota: true,
        sshKeys: true,
        virtualMachines: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.excludePassword(user);
  }

  async adminUpdateUser(id: string, dto: AdminUpdateUserDto, actorRole?: string) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    return this.excludePassword(updated);
  }

  async deleteUser(id: string, actorRole?: string) {
    this.assertAdminRole(actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: "User deleted successfully" };
  }

  async getStats(actorRole?: string) {
    this.assertAdminRole(actorRole);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, newThisMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    return { total, active, newThisMonth };
  }
}
