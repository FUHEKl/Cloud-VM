"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { Plan } from "@/types";

interface OneTemplate {
  id: number;
  name: string;
}

export default function CreateVmPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [templates, setTemplates] = useState<OneTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    osTemplate: "",
    cpu: 1,
    ramMb: 1024,
    diskGb: 10,
    planId: "",
  });
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/plans")
      .then(({ data }) => {
        const p = Array.isArray(data) ? data : data.data || [];
        setPlans(p);
        if (p.length > 0) setForm((f) => ({ ...f, planId: p[0].id }));
      })
      .catch(() => {});

    api
      .get("/vms/templates")
      .then(({ data }) => {
        const t: OneTemplate[] = Array.isArray(data) ? data : [];
        setTemplates(t);
        if (t.length > 0) setForm((f) => ({ ...f, osTemplate: t[0].name }));
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const selectedPlan = plans.find((p) => p.id === form.planId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = useCustom
        ? {
            name: form.name,
            osTemplate: form.osTemplate,
            cpu: form.cpu,
            ramMb: form.ramMb,
            diskGb: form.diskGb,
          }
        : {
            name: form.name,
            osTemplate: form.osTemplate,
            planId: form.planId,
            cpu: selectedPlan?.cpu || 1,
            ramMb: selectedPlan?.ramMb || 1024,
            diskGb: selectedPlan?.diskGb || 10,
          };
      await api.post("/vms", body);
      router.push("/dashboard/vms");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create VM");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-cyber-text mb-2">
        Create Virtual Machine
      </h1>
      <p className="text-cyber-text-dim mb-6">
        Configure and launch a new VM instance
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* VM Name */}
        <div className="cyber-card">
          <h3 className="text-lg font-semibold text-cyber-text mb-4">
            Basic Info
          </h3>
          <div>
            <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
              VM Name
            </label>
            <input
              type="text"
              className="cyber-input"
              placeholder="my-server"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
        </div>

        {/* OS Template */}
        <div className="cyber-card">
          <h3 className="text-lg font-semibold text-cyber-text mb-4">
            Template
          </h3>
          {templatesLoading ? (
            <p className="text-cyber-text-dim text-sm">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="text-cyber-text-dim text-sm">No templates found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {templates.map((tmpl) => (
                <button
                  type="button"
                  key={tmpl.id}
                  onClick={() => setForm({ ...form, osTemplate: tmpl.name })}
                  className={`p-3 rounded-lg border text-left transition-all duration-200 ${
                    form.osTemplate === tmpl.name
                      ? "border-cyber-green bg-cyber-green/10 shadow-glow-green"
                      : "border-cyber-border hover:border-cyber-cyan/30"
                  }`}
                >
                  <div className="text-xl mb-1">🖥️</div>
                  <div className="text-sm font-medium text-cyber-text">
                    {tmpl.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plan Selection */}
        <div className="cyber-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-cyber-text">Resources</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustom}
                onChange={(e) => setUseCustom(e.target.checked)}
                className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-cyber-green focus:ring-cyber-green"
              />
              <span className="text-sm text-cyber-text-dim">Custom config</span>
            </label>
          </div>

          {!useCustom ? (
            <div className="grid sm:grid-cols-3 gap-3">
              {plans.length === 0 ? (
                <p className="text-cyber-text-dim text-sm col-span-3">
                  No plans available. Use custom configuration.
                </p>
              ) : (
                plans.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => setForm({ ...form, planId: plan.id })}
                    className={`p-4 rounded-lg border text-left transition-all duration-200 ${
                      form.planId === plan.id
                        ? "border-cyber-green bg-cyber-green/10 shadow-glow-green"
                        : "border-cyber-border hover:border-cyber-cyan/30"
                    }`}
                  >
                    <div className="font-semibold text-cyber-text mb-2">
                      {plan.name}
                    </div>
                    <div className="space-y-1 text-sm text-cyber-text-dim">
                      <div>{plan.cpu} vCPU</div>
                      <div>
                        {plan.ramMb >= 1024
                          ? `${plan.ramMb / 1024} GB`
                          : `${plan.ramMb} MB`}{" "}
                        RAM
                      </div>
                      <div>{plan.diskGb} GB Disk</div>
                    </div>
                    <div className="mt-3 text-cyber-green font-semibold">
                      {plan.priceMonthly === 0
                        ? "Free"
                        : `${plan.priceMonthly.toLocaleString()} DZD/mo`}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  CPU Cores:{" "}
                  <span className="text-cyber-green">{form.cpu}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={form.cpu}
                  onChange={(e) =>
                    setForm({ ...form, cpu: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>1</span>
                  <span>16</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  RAM:{" "}
                  <span className="text-cyber-green">
                    {form.ramMb >= 1024
                      ? `${form.ramMb / 1024} GB`
                      : `${form.ramMb} MB`}
                  </span>
                </label>
                <input
                  type="range"
                  min="512"
                  max="32768"
                  step="512"
                  value={form.ramMb}
                  onChange={(e) =>
                    setForm({ ...form, ramMb: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>512 MB</span>
                  <span>32 GB</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  Disk:{" "}
                  <span className="text-cyber-green">{form.diskGb} GB</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={form.diskGb}
                  onChange={(e) =>
                    setForm({ ...form, diskGb: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>10 GB</span>
                  <span>500 GB</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="cyber-btn-primary flex-1"
          >
            {loading ? "Creating..." : "Create Virtual Machine"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="cyber-btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
