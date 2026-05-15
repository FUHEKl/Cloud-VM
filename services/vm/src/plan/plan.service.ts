import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { CreatePlanDto } from "./dto/create-plan.dto";

type PlanRecord = {
  id: string;
  name: string;
  maxVms: number;
  cpu: number;
  ramMb: number;
  diskGb: number;
  priceMonthly: number;
  isActive: boolean;
};

function loadInitialPlans(): PlanRecord[] {
  const catalog = process.env.PLAN_CATALOG_JSON;
  if (!catalog) {
    return [];
  }

  try {
    const parsed = JSON.parse(catalog) as Record<string, { amountDt?: number; quota?: { maxVms?: number; maxCpu?: number; maxRamMb?: number; maxDiskGb?: number } }>;
    return Object.entries(parsed)
      .map(([id, cfg]) => ({
        id,
        name: `${id[0].toUpperCase()}${id.slice(1)} Plan`,
        maxVms: cfg.quota?.maxVms ?? 1,
        cpu: cfg.quota?.maxCpu ?? 1,
        ramMb: cfg.quota?.maxRamMb ?? 512,
        diskGb: cfg.quota?.maxDiskGb ?? 5,
        priceMonthly: cfg.amountDt ?? 0,
        isActive: true,
      }))
      .sort((a, b) => a.priceMonthly - b.priceMonthly);
  } catch {
    return [];
  }
}

@Injectable()
export class PlanService {
  private readonly plans = new Map<string, PlanRecord>(loadInitialPlans().map((plan) => [plan.id, plan]));

  async findAll() {
    return [...this.plans.values()]
      .filter((plan) => plan.isActive)
      .sort((a, b) => a.priceMonthly - b.priceMonthly);
  }

  async findOne(id: string) {
    const plan = this.plans.get(id);
    if (!plan) {
      throw new NotFoundException("Plan not found");
    }
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const id = randomUUID();
    const plan: PlanRecord = {
      id,
      name: dto.name,
      maxVms: dto.maxVms,
      cpu: dto.cpu,
      ramMb: dto.ramMb,
      diskGb: dto.diskGb,
      priceMonthly: dto.priceMonthly,
      isActive: true,
    };
    this.plans.set(id, plan);
    return plan;
  }

  async update(id: string, dto: Partial<CreatePlanDto>) {
    const plan = await this.findOne(id);
    const updated = { ...plan, ...dto };
    this.plans.set(id, updated);
    return updated;
  }

  async deactivate(id: string) {
    const plan = await this.findOne(id);
    const updated = { ...plan, isActive: false };
    this.plans.set(id, updated);
    return updated;
  }
}
