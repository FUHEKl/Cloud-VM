"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

interface BillingOverviewResponse {
  overview: {
    totalUsers: number;
    paidPayments: number;
    pendingPayments: number;
    totalRevenueTnd: number;
  };
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: "USER" | "ADMIN";
    isActive: boolean;
    subscription: "student" | "pro" | "enterprise" | "unlimited";
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    method?: string | null;
    createdAt: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: "USER" | "ADMIN";
      isActive: boolean;
    };
  }>;
}

export default function AdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<BillingOverviewResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<BillingOverviewResponse>(
        `/users/admin/billing-overview?search=${encodeURIComponent(search)}`,
      );
      setData(res.data);
    } catch {
      setError("Failed to load admin billing overview");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text mb-2">Admin Billing Control Center</h1>
        <p className="text-cyber-text-dim text-sm">
          Monitor revenue, inspect recent payment events, and review user subscription state.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
        <div className="cyber-card">
          <p className="text-cyber-text-dim text-sm">Total Revenue</p>
          <p className="text-2xl font-bold text-cyber-green mt-1">
            {data?.overview.totalRevenueTnd?.toFixed(2) ?? "0.00"} TND
          </p>
        </div>
        <div className="cyber-card">
          <p className="text-cyber-text-dim text-sm">Paid Payments</p>
          <p className="text-2xl font-bold text-cyber-cyan mt-1">{data?.overview.paidPayments ?? 0}</p>
        </div>
        <div className="cyber-card">
          <p className="text-cyber-text-dim text-sm">Pending Payments</p>
          <p className="text-2xl font-bold text-cyber-orange mt-1">{data?.overview.pendingPayments ?? 0}</p>
        </div>
        <div className="cyber-card">
          <p className="text-cyber-text-dim text-sm">Users</p>
          <p className="text-2xl font-bold text-cyber-text mt-1">{data?.overview.totalUsers ?? 0}</p>
        </div>
      </div>

      <div className="cyber-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-cyber-text">Subscriptions by user</h2>
          <input
            type="text"
            className="cyber-input max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
          />
        </div>

        {loading ? (
          <p className="text-sm text-cyber-text-dim">Loading overview...</p>
        ) : !data || data.users.length === 0 ? (
          <p className="text-sm text-cyber-text-dim">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Subscription</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.firstName} {u.lastName}</td>
                    <td>{u.email}</td>
                    <td className="uppercase">{u.role}</td>
                    <td>{u.isActive ? "Active" : "Banned"}</td>
                    <td className="uppercase">{u.subscription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="cyber-card">
        <h2 className="text-lg font-semibold text-cyber-text mb-4">Recent payment events</h2>
        {!data || data.recentPayments.length === 0 ? (
          <p className="text-sm text-cyber-text-dim">No payment events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.createdAt).toLocaleString()}</td>
                    <td>{payment.user.firstName} {payment.user.lastName}</td>
                    <td>{payment.amount} {payment.currency}</td>
                    <td className="uppercase">{payment.status}</td>
                    <td className="break-all text-cyber-text-dim">{payment.method || "-"}</td>
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
