"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useAuth } from "@/lib/auth";
import type { SubscriptionPlanId, UserProfileDetails } from "@/types";

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
  const { user } = useAuth();
  const params = useSearchParams();
  const preferredPlan = params.get("plan") as PlanId | null;
  const status = params.get("status");
  const successSessionId = params.get("session_id");
  const isAdmin = user?.role === "ADMIN";

  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [profileDetails, setProfileDetails] = useState<UserProfileDetails | null>(null);

  const orderedPlans = useMemo(() => {
    if (!preferredPlan) return plans;
    const preferred = plans.find((p) => p.id === preferredPlan);
    if (!preferred) return plans;
    return [preferred, ...plans.filter((p) => p.id !== preferred.id)];
  }, [preferredPlan]);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const { data } = await api.get<PaymentRecord[]>("/payments/me");
      setPayments(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load payment history"));
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const loadProfileDetails = useCallback(async () => {
    try {
      const { data } = await api.get<UserProfileDetails>("/users/profile");
      setProfileDetails(data);
    } catch {
      // optional panel data
    }
  }, []);

  useEffect(() => {
    void loadPayments();
    void loadProfileDetails();
  }, [loadPayments, loadProfileDetails, status]);

  useEffect(() => {
    if (status !== "success" || !successSessionId || isAdmin) return;

    const confirm = async () => {
      try {
        await api.post("/payments/confirm-session", { sessionId: successSessionId });
        await Promise.all([loadPayments(), loadProfileDetails()]);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Payment succeeded but plan activation is still processing"));
      }
    };

    void confirm();
  }, [status, successSessionId, isAdmin, loadPayments, loadProfileDetails]);

  const planRank: Record<SubscriptionPlanId, number> = {
    student: 1,
    pro: 2,
    enterprise: 3,
    unlimited: 99,
  };

  const activePlan = profileDetails?.subscription?.planId;
  const canRenewSamePlan = profileDetails?.subscription?.canRenewSamePlan ?? true;

  const isPlanSelectable = (planId: PlanId) => {
    if (!activePlan || activePlan === "unlimited") return true;

    const requestedRank = planRank[planId];
    const currentRank = planRank[activePlan];

    if (requestedRank > currentRank) return true;
    return canRenewSamePlan;
  };

  const planBlockReason = (planId: PlanId) => {
    if (!activePlan || activePlan === "unlimited") return "";
    const requestedRank = planRank[planId];
    const currentRank = planRank[activePlan];

    if (requestedRank <= currentRank && !canRenewSamePlan) {
      return "Same or lower plan is locked until cycle end or until you reach 90% VM-hours usage.";
    }

    return "";
  };

  useEffect(() => {
    if (status !== "success") return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      void loadPayments();
      if (Date.now() - startedAt > 20_000) {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, loadPayments]);

  const startCheckout = async (planId: PlanId) => {
    setError("");
    if (isAdmin) {
      setError("Admin accounts are unlimited and cannot create Stripe checkout sessions.");
      return;
    }
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
        <p className="text-cyber-text-dim text-sm mt-1">
          Note: Stripe charges your card in USD using the current configured conversion rate.
        </p>
        {isAdmin && (
          <p className="text-cyber-cyan text-sm mt-1">
            Admin account detected: unlimited access is active, billing checkout is disabled.
          </p>
        )}
      </div>

      {status === "success" && (
        <div className="px-4 py-3 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm">
          Payment completed. Your transaction is being recorded.
        </div>
      )}

      {status === "cancelled" && (
        <div className="px-4 py-3 rounded-lg bg-cyber-orange/10 border border-cyber-orange/30 text-cyber-orange text-sm">
          Checkout cancelled. No charge was made.
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      {profileDetails?.subscription && !isAdmin && (
        <div className="px-4 py-3 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-text text-sm">
          <span className="font-medium text-cyber-cyan uppercase">{profileDetails.subscription.planId}</span>
          {" "}plan · VM hours used: {profileDetails.subscription.vmHoursUsed.toFixed(2)} / {profileDetails.subscription.vmHoursIncluded}
          {" "}· Remaining: {profileDetails.subscription.vmHoursRemaining.toFixed(2)}
          {" "}· Cycle ends: {new Date(profileDetails.subscription.cycleEndsAt).toLocaleDateString()}
        </div>
      )}

      {!profileDetails?.subscription && !isAdmin && (
        <div className="px-4 py-3 rounded-lg bg-cyber-orange/10 border border-cyber-orange/30 text-cyber-orange text-sm">
          No active subscription yet. Purchase a plan to activate VM quota.
        </div>
      )}

      {!isAdmin && (
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
                disabled={loadingPlan !== null || !isPlanSelectable(plan.id)}
                className="cyber-btn-primary w-full disabled:opacity-50"
              >
                {loadingPlan === plan.id ? "Opening Stripe..." : `Pay ${plan.dt} DT`}
              </button>
              {!isPlanSelectable(plan.id) && (
                <p className="text-xs text-cyber-orange mt-2">
                  {planBlockReason(plan.id)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

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