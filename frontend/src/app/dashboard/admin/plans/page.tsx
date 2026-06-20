"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PublicPlanCatalogItem } from "@/types";

type PlanId = PublicPlanCatalogItem["id"];

type PlanDraft = {
  amountDt: string;
  vmHoursMonthly: string;
  maxVms: string;
  maxCpu: string;
  maxRamGb: string;
  maxDiskGb: string;
};

type CardMessage = {
  type: "success" | "error";
  text: string;
};

function toDraft(plan: PublicPlanCatalogItem): PlanDraft {
  return {
    amountDt: String(plan.amountDt),
    vmHoursMonthly: String(plan.vmHoursMonthly),
    maxVms: String(plan.quota.maxVms),
    maxCpu: String(plan.quota.maxCpu),
    maxRamGb: String(Math.round(plan.quota.maxRamMb / 1024)),
    maxDiskGb: String(plan.quota.maxDiskGb),
  };
}

function toPublicPlan(planId: PlanId, raw: {
  amountDt: number;
  rank: number;
  vmHoursMonthly: number;
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
}): PublicPlanCatalogItem {
  const name = planId.charAt(0).toUpperCase() + planId.slice(1);
  return {
    id: planId,
    name,
    amountDt: raw.amountDt,
    rank: raw.rank,
    vmHoursMonthly: raw.vmHoursMonthly,
    quota: {
      maxVms: raw.maxVms,
      maxCpu: raw.maxCpu,
      maxRamMb: raw.maxRamMb,
      maxDiskGb: raw.maxDiskGb,
    },
    features: [
      `${raw.maxVms} VMs`,
      `${raw.vmHoursMonthly} VM hours/month`,
      `${raw.maxCpu} vCPU · ${Math.round(raw.maxRamMb / 1024)} GB RAM · ${raw.maxDiskGb} GB disk`,
    ],
  };
}

export default function AdminPlansPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [plans, setPlans] = useState<PublicPlanCatalogItem[]>([]);
  const [drafts, setDrafts] = useState<Record<PlanId, PlanDraft>>({} as Record<PlanId, PlanDraft>);
  const [messages, setMessages] = useState<Record<PlanId, CardMessage | undefined>>({} as Record<PlanId, CardMessage | undefined>);
  const [loading, setLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState<PlanId | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (user?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user?.role]);

  const loadPlans = useCallback(async () => {
    try {
      const { data } = await api.get<PublicPlanCatalogItem[]>("/payments/admin/plans");
      const nextPlans = Array.isArray(data) ? data : [];
      setPlans(nextPlans);
      setDrafts(nextPlans.reduce((acc, plan) => {
        acc[plan.id] = toDraft(plan);
        return acc;
      }, {} as Record<PlanId, PlanDraft>));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || user?.role !== "ADMIN") return;
    void loadPlans();
  }, [isLoading, loadPlans, user?.role]);

  const orderedPlans = useMemo(() => [...plans].sort((a, b) => a.rank - b.rank), [plans]);

  const updateDraft = (planId: PlanId, key: keyof PlanDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [planId]: {
        ...(prev[planId] ?? toDraft(plans.find((p) => p.id === planId) ?? plans[0])),
        [key]: value,
      },
    }));
    setMessages((prev) => ({ ...prev, [planId]: undefined }));
  };

  const savePlan = async (planId: PlanId) => {
    const original = plans.find((plan) => plan.id === planId);
    const draft = drafts[planId];
    if (!original || !draft) return;

    const payload: Record<string, number> = {};
    const amountDt = Number(draft.amountDt);
    const vmHoursMonthly = Number(draft.vmHoursMonthly);
    const maxVms = Number(draft.maxVms);
    const maxCpu = Number(draft.maxCpu);
    const maxRamGb = Number(draft.maxRamGb);
    const maxDiskGb = Number(draft.maxDiskGb);

    if (Number.isFinite(amountDt) && amountDt !== original.amountDt) payload.amountDt = amountDt;
    if (Number.isFinite(vmHoursMonthly) && vmHoursMonthly !== original.vmHoursMonthly) payload.vmHoursMonthly = vmHoursMonthly;
    if (Number.isFinite(maxVms) && maxVms !== original.quota.maxVms) payload.maxVms = maxVms;
    if (Number.isFinite(maxCpu) && maxCpu !== original.quota.maxCpu) payload.maxCpu = maxCpu;
    if (Number.isFinite(maxRamGb) && maxRamGb * 1024 !== original.quota.maxRamMb) payload.maxRamMb = maxRamGb * 1024;
    if (Number.isFinite(maxDiskGb) && maxDiskGb !== original.quota.maxDiskGb) payload.maxDiskGb = maxDiskGb;

    if (Object.keys(payload).length === 0) {
      setMessages((prev) => ({
        ...prev,
        [planId]: { type: "success", text: "No changes to save." },
      }));
      return;
    }

    setSavingPlanId(planId);
    setMessages((prev) => ({ ...prev, [planId]: undefined }));
    try {
      const { data } = await api.put(`/payments/admin/plans/${planId}`, payload);
      const updated = toPublicPlan(planId, data);
      setPlans((prev) => prev.map((plan) => (plan.id === planId ? updated : plan)));
      setDrafts((prev) => ({ ...prev, [planId]: toDraft(updated) }));
      setMessages((prev) => ({
        ...prev,
        [planId]: { type: "success", text: `${updated.name} saved successfully.` },
      }));
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : "Failed to save plan";
      setMessages((prev) => ({
        ...prev,
        [planId]: { type: "error", text },
      }));
    } finally {
      setSavingPlanId(null);
    }
  };

  if (isLoading || user?.role !== "ADMIN") {
    return <div className="text-cyber-text-dim">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text mb-2">Plan Pricing Management</h1>
        <p className="text-cyber-text-dim">
          Update the database-backed catalog. Changes apply immediately to pricing and billing.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="cyber-card h-80 animate-pulse bg-cyber-border/20" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {orderedPlans.map((plan) => {
            const draft = drafts[plan.id] ?? toDraft(plan);
            const message = messages[plan.id];
            return (
              <div key={plan.id} className="cyber-card space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-cyber-text">{plan.name}</h2>
                  <p className="text-sm text-cyber-text-dim">Plan ID: {plan.id}</p>
                </div>

                {message && (
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      message.type === "success"
                        ? "bg-cyber-green/10 border border-cyber-green/30 text-cyber-green"
                        : "bg-cyber-red/10 border border-cyber-red/30 text-cyber-red"
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <label className="block text-sm text-cyber-text-dim space-y-1">
                  <span>Price (DT)</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.amountDt}
                    onChange={(e) => updateDraft(plan.id, "amountDt", e.target.value)}
                    className="cyber-input w-full"
                  />
                </label>

                <label className="block text-sm text-cyber-text-dim space-y-1">
                  <span>VM hours / month</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.vmHoursMonthly}
                    onChange={(e) => updateDraft(plan.id, "vmHoursMonthly", e.target.value)}
                    className="cyber-input w-full"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-cyber-text-dim space-y-1">
                    <span>Max VMs</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.maxVms}
                      onChange={(e) => updateDraft(plan.id, "maxVms", e.target.value)}
                      className="cyber-input w-full"
                    />
                  </label>

                  <label className="block text-sm text-cyber-text-dim space-y-1">
                    <span>Max CPU</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.maxCpu}
                      onChange={(e) => updateDraft(plan.id, "maxCpu", e.target.value)}
                      className="cyber-input w-full"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-cyber-text-dim space-y-1">
                    <span>Max RAM (GB)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.maxRamGb}
                      onChange={(e) => updateDraft(plan.id, "maxRamGb", e.target.value)}
                      className="cyber-input w-full"
                    />
                  </label>

                  <label className="block text-sm text-cyber-text-dim space-y-1">
                    <span>Max Disk (GB)</span>
                    <input
                      type="number"
                      min="5"
                      step="1"
                      value={draft.maxDiskGb}
                      onChange={(e) => updateDraft(plan.id, "maxDiskGb", e.target.value)}
                      className="cyber-input w-full"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void savePlan(plan.id)}
                  disabled={savingPlanId === plan.id}
                  className="cyber-btn-primary w-full disabled:opacity-50"
                >
                  {savingPlanId === plan.id ? "Saving..." : "Save changes"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
