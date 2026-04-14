"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";

type PlanId = "student" | "pro" | "enterprise";

const plans: Array<{
  id: PlanId;
  name: string;
  dt: number;
  features: string[];
}> = [
  {
    id: "student",
    name: "Student",
    dt: 29,
    features: ["2 VMs", "60 VM hours/month", "2 vCPU · 4 GB RAM · 40 GB disk"],
  },
  {
    id: "pro",
    name: "Pro",
    dt: 79,
    features: ["6 VMs", "220 VM hours/month", "4 vCPU · 8 GB RAM · 120 GB disk"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    dt: 199,
    features: ["20 VMs", "900 VM hours/month", "8 vCPU · 16 GB RAM · 400 GB disk"],
  },
];

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  createdAt: string;
}

export default function BillingPage() {
  const params = useSearchParams();
  const preferredPlan = params.get("plan") as PlanId | null;

  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const orderedPlans = useMemo(() => {
    if (!preferredPlan) return plans;
    const preferred = plans.find((p) => p.id === preferredPlan);
    if (!preferred) return plans;
    return [preferred, ...plans.filter((p) => p.id !== preferred.id)];
  }, [preferredPlan]);

  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      const { data } = await api.get<PaymentRecord[]>("/payments/me");
      setPayments(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load payment history"));
    } finally {
      setLoadingPayments(false);
    }
  };

  const startCheckout = async (planId: PlanId) => {
    setError("");
    setLoadingPlan(planId);
    try {
      const { data } = await api.post<{ checkoutUrl?: string }>(
        "/payments/checkout-session",
        { planId },
      );

      if (!data?.checkoutUrl) {
        throw new Error("Missing checkout URL");
      }

      window.location.assign(data.checkoutUrl);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to start Stripe checkout"));
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text mb-2">Billing</h1>
        <p className="text-cyber-text-dim">
          Plans are billed in Tunisian dinar (DT). Card payment is processed securely with Stripe.
        </p>
      </div>

      {params.get("status") === "success" && (
        <div className="px-4 py-3 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm">
          Payment completed. Your transaction is being recorded.
        </div>
      )}

      {params.get("status") === "cancelled" && (
        <div className="px-4 py-3 rounded-lg bg-cyber-orange/10 border border-cyber-orange/30 text-cyber-orange text-sm">
          Checkout cancelled. No charge was made.
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {orderedPlans.map((plan) => (
          <div key={plan.id} className="cyber-card">
            <h3 className="text-lg font-semibold text-cyber-text mb-1">{plan.name}</h3>
            <p className="text-3xl font-bold text-cyber-green mb-4">{plan.dt} DT<span className="text-sm text-cyber-text-dim"> / month</span></p>
            <ul className="space-y-2 mb-5 text-sm text-cyber-text-dim">
              {plan.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            <button
              onClick={() => startCheckout(plan.id)}
              disabled={loadingPlan !== null}
              className="cyber-btn-primary w-full disabled:opacity-50"
            >
              {loadingPlan === plan.id ? "Opening Stripe..." : `Pay ${plan.dt} DT`}
            </button>
          </div>
        ))}
      </div>

      <div className="cyber-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-cyber-text">Payment History</h2>
          <button onClick={loadPayments} className="cyber-btn-secondary !py-2">
            {loadingPayments ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-cyber-text-dim">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-cyber-text-dim border-b border-cyber-border">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-cyber-border/40">
                    <td className="py-2 pr-4 text-cyber-text">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-cyber-text">{p.amount} {p.currency}</td>
                    <td className="py-2 pr-4 text-cyber-text">{p.status}</td>
                    <td className="py-2 text-cyber-text-dim break-all">{p.method || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}