import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlanDto } from "./dto/create-plan.dto";

@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException("Plan not found");
    }
    return plan;
  }

  async create(dto: CreatePlanDto) {
    return this.prisma.plan.create({
      data: {
        name: dto.name,
        maxVms: dto.maxVms,
        cpu: dto.cpu,
        ramMb: dto.ramMb,
        diskGb: dto.diskGb,
        priceMonthly: dto.priceMonthly,
      },
    });
  }

  async update(id: string, dto: Partial<CreatePlanDto>) {
    await this.findOne(id);
    return this.prisma.plan.update({
      where: { id },
      data: dto,
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
