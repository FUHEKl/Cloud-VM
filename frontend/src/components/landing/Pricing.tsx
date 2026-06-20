"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import type { PublicPlanCatalogItem } from "@/types";
function formatDt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function LoadingCard({ highlighted = false }: { highlighted?: boolean }) {
  return (
    <div
      className={`cyber-card relative overflow-hidden animate-pulse ${
        highlighted ? "border-cyber-green/40" : ""
      }`}
    >
      <div className="h-5 w-24 bg-cyber-border/40 rounded mb-4" />
      <div className="h-10 w-32 bg-cyber-border/40 rounded mb-3" />
      <div className="space-y-3 mb-8">
        <div className="h-3 bg-cyber-border/30 rounded w-full" />
        <div className="h-3 bg-cyber-border/30 rounded w-4/5" />
        <div className="h-3 bg-cyber-border/30 rounded w-3/4" />
        <div className="h-3 bg-cyber-border/30 rounded w-2/3" />
      </div>
      <div className="h-11 bg-cyber-border/40 rounded" />
    const [loading, setLoading] = useState(true);
    </div>
  );
}

export default function Pricing() {
  const [plans, setPlans] = useState<PublicPlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const loadPlans = async () => {
      try {
        const { data } = await api.get<PublicPlanCatalogItem[]>("/payments/plans");
        if (alive && Array.isArray(data)) {
          setPlans(data);
        }
      } catch {
        if (alive) setPlans([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadPlans();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-cyber-text">Simple </span>
            <span className="text-cyber-green">Pricing</span>
          </h2>
          <p className="text-cyber-text-dim max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include web terminal
            access.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {loading
            ? [1, 2, 3].map((i) => (
                <LoadingCard key={i} highlighted={i === 2} />
              ))
            : plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`cyber-card relative overflow-hidden transition-all duration-300 ${
                    plan.id === "pro"
                      ? "border-cyber-green/40 shadow-glow-green scale-105"
                      : "hover:border-cyber-cyan/30"
                  }`}
                >
                  {plan.id === "pro" && (
                    <div className="absolute top-0 right-0 bg-cyber-green text-cyber-bg text-xs font-bold px-3 py-1 rounded-bl-lg">
                      POPULAR
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-cyber-text mb-1">
                      {plan.name}
                    </h3>
                    <p className="text-cyber-text-dim text-sm">
                      {plan.features.length > 0
                        ? `${plan.vmHoursMonthly} VM hours / month`
                        : "Managed subscription"}
                    </p>
                  </div>

                  <div className="mb-6">
                    <span className="text-4xl font-extrabold text-cyber-text">
                      {formatDt(plan.amountDt)}
                    </span>
                    <span className="text-cyber-text-dim ml-1">DT / month</span>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-3 text-sm">
                        <svg
                          className="w-4 h-4 flex-shrink-0 text-cyber-cyan"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <span className="text-cyber-text-dim">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/dashboard/billing?plan=${plan.id}`}
                    className={`block text-center w-full ${
                      plan.id === "pro" ? "cyber-btn-primary" : "cyber-btn-secondary"
                    }`}
                  >
                    {plan.id === "student"
                      ? "Choose Student"
                      : plan.id === "pro"
                        ? "Choose Pro"
                        : "Choose Enterprise"}
                  </Link>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
