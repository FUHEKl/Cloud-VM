"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { User, UserStats } from "@/types";
import { useAuth } from "@/lib/auth";

type SubscriptionPlanId = "student" | "pro" | "enterprise" | "unlimited";

interface BillingSummary {
  subscription: SubscriptionPlanId;
  totalSpent: number;
  paidPaymentsCount: number;
  pendingPaymentsCount: number;
  lastPaid: {
    amount: number;
    currency: string;
    createdAt: string;
    status: string;
  } | null;
  recentPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    method?: string | null;
    createdAt: string;
  }>;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    active: 0,
    newThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [subscriptionDraft, setSubscriptionDraft] = useState<Record<string, SubscriptionPlanId>>({});
  const limit = 10;

  const loadUsers = useCallback(async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.get(`/users?page=${page}&limit=${limit}&search=${search}`),
        api.get("/users/stats"),
      ]);
      const usersData = usersRes.data;
      setUsers(Array.isArray(usersData) ? usersData : usersData.data || []);
      setTotal(usersData.total || usersData.length || 0);
      setStats(statsRes.data);
    } catch {
      setMessage({ type: "error", text: "Failed to load users" });
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openUserPanel = async (account: User) => {
    setSelectedUser(account);
    setLoadingSummary(true);
    setBillingSummary(null);
    try {
      const { data } = await api.get<BillingSummary>(`/users/${account.id}/billing-summary`);
      setBillingSummary(data);
      setSubscriptionDraft((prev) => ({
        ...prev,
        [account.id]: data.subscription,
      }));
    } catch {
      setMessage({ type: "error", text: "Failed to load account billing details" });
    } finally {
      setLoadingSummary(false);
    }
  };

  const toggleActive = async (target: User) => {
    if (target.id === currentUser?.id && target.isActive) {
      setMessage({ type: "error", text: "You cannot ban your own admin account." });
      return;
    }

    setActionBusyUserId(target.id);
    try {
      await api.patch(`/users/${target.id}`, { isActive: !target.isActive });
      setMessage({
        type: "success",
        text: target.isActive ? "Account banned successfully" : "Account unbanned successfully",
      });
      await loadUsers();
      if (selectedUser?.id === target.id) {
        await openUserPanel({ ...target, isActive: !target.isActive });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update account status" });
    } finally {
      setActionBusyUserId(null);
    }
  };

  const changeRole = async (target: User) => {
    if (target.id === currentUser?.id && target.role === "ADMIN") {
      setMessage({ type: "error", text: "You cannot revoke your own admin role." });
      return;
    }

    const newRole = target.role === "ADMIN" ? "USER" : "ADMIN";
    setActionBusyUserId(target.id);
    try {
      await api.patch(`/users/${target.id}`, { role: newRole });
      setMessage({ type: "success", text: `Role updated to ${newRole}` });
      await loadUsers();
      if (selectedUser?.id === target.id) {
        await openUserPanel({ ...target, role: newRole as User["role"] });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update role" });
    } finally {
      setActionBusyUserId(null);
    }
  };

  const grantSubscription = async (target: User) => {
    const planId = subscriptionDraft[target.id] || "student";
    setActionBusyUserId(target.id);
    try {
      await api.patch(`/users/${target.id}/subscription`, { planId });
      setMessage({ type: "success", text: `Subscription set to ${planId}` });
      await loadUsers();
      if (selectedUser?.id === target.id) {
        await openUserPanel(target);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to grant subscription" });
    } finally {
      setActionBusyUserId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await api.delete(`/users/${userId}`);
      setMessage({ type: "success", text: "User deleted successfully" });
      await loadUsers();
    } catch {
      setMessage({ type: "error", text: "Failed to delete user" });
    }
  };

  const statCards = [
    { label: "Total Users", value: stats.total, color: "text-cyber-cyan" },
    { label: "Active", value: stats.active, color: "text-cyber-green" },
    {
      label: "New This Month",
      value: stats.newThisMonth,
      color: "text-cyber-orange",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-cyber-text mb-6">Manage Users</h1>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-cyber-green/10 border border-cyber-green/30 text-cyber-green"
              : "bg-cyber-red/10 border border-cyber-red/30 text-cyber-red"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="cyber-card text-center">
            <div className={`text-3xl font-bold ${s.color}`}>
              {loading ? "-" : s.value}
            </div>
            <div className="text-sm text-cyber-text-dim mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          className="cyber-input max-w-sm"
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Users Table */}
      <div className="cyber-card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-cyber-text-dim">Loading...</div>
        ) : (
          <table className="cyber-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyber-green/20 border border-cyber-green/30 flex items-center justify-center text-cyber-green text-xs font-semibold">
                        {u.firstName[0]}
                        {u.lastName[0]}
                      </div>
                      <span className="font-medium text-cyber-text">
                        {u.firstName} {u.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="text-cyber-text-dim text-sm">{u.email}</td>
                  <td>
                    <button
                      onClick={() => changeRole(u)}
                      disabled={actionBusyUserId === u.id}
                      className={
                        u.role === "ADMIN"
                          ? "cyber-badge-orange cursor-pointer"
                          : "cyber-badge-cyan cursor-pointer"
                      }
                    >
                      {u.role}
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={actionBusyUserId === u.id}
                      className={
                        u.isActive
                          ? "cyber-badge-green cursor-pointer"
                          : "cyber-badge-red cursor-pointer"
                      }
                    >
                      {u.isActive ? "Active" : "Banned"}
                    </button>
                  </td>
                  <td className="text-cyber-text-dim text-sm">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openUserPanel(u)}
                        className="cyber-btn-secondary !py-1.5 !px-2 text-xs"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="text-cyber-text-dim hover:text-cyber-red transition-colors"
                        title="Delete user"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-cyber-border">
            <span className="text-sm text-cyber-text-dim">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="cyber-btn-secondary !py-1.5 !px-3 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= Math.ceil(total / limit)}
                className="cyber-btn-secondary !py-1.5 !px-3 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="cyber-card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-cyber-text">
              Account Insights — {selectedUser.firstName} {selectedUser.lastName}
            </h2>
            <button
              onClick={() => setSelectedUser(null)}
              className="cyber-btn-secondary !py-1.5 !px-3 text-sm"
            >
              Close
            </button>
          </div>

          {loadingSummary ? (
            <p className="text-cyber-text-dim text-sm">Loading account details...</p>
          ) : billingSummary ? (
            <div className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-xs text-cyber-text-dim">Subscription</p>
                  <p className="text-cyber-text font-semibold uppercase">{billingSummary.subscription}</p>
                </div>
                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-xs text-cyber-text-dim">Total Spent</p>
                  <p className="text-cyber-text font-semibold">{billingSummary.totalSpent.toFixed(2)} TND</p>
                </div>
                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-xs text-cyber-text-dim">Paid Payments</p>
                  <p className="text-cyber-text font-semibold">{billingSummary.paidPaymentsCount}</p>
                </div>
                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-xs text-cyber-text-dim">Pending Payments</p>
                  <p className="text-cyber-text font-semibold">{billingSummary.pendingPaymentsCount}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-sm font-medium text-cyber-text mb-2">Admin actions</p>
                  <div className="flex items-center gap-2 mb-3">
                    <select
                      className="cyber-input"
                      value={subscriptionDraft[selectedUser.id] || billingSummary.subscription}
                      onChange={(e) =>
                        setSubscriptionDraft((prev) => ({
                          ...prev,
                          [selectedUser.id]: e.target.value as SubscriptionPlanId,
                        }))
                      }
                    >
                      <option value="student">Student</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                    <button
                      className="cyber-btn-primary !py-2"
                      onClick={() => grantSubscription(selectedUser)}
                      disabled={actionBusyUserId === selectedUser.id}
                    >
                      Apply Subscription
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="cyber-btn-secondary !py-2"
                      onClick={() => changeRole(selectedUser)}
                      disabled={actionBusyUserId === selectedUser.id}
                    >
                      {selectedUser.role === "ADMIN" ? "Revoke admin" : "Promote to admin"}
                    </button>
                    <button
                      className="cyber-btn-secondary !py-2"
                      onClick={() => toggleActive(selectedUser)}
                      disabled={actionBusyUserId === selectedUser.id}
                    >
                      {selectedUser.isActive ? "Ban account" : "Unban account"}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-cyber-border bg-cyber-bg-soft/30">
                  <p className="text-sm font-medium text-cyber-text mb-2">Last payment</p>
                  {billingSummary.lastPaid ? (
                    <div className="text-sm text-cyber-text-dim space-y-1">
                      <p>
                        Amount: <span className="text-cyber-text">{billingSummary.lastPaid.amount} {billingSummary.lastPaid.currency}</span>
                      </p>
                      <p>
                        Status: <span className="text-cyber-text uppercase">{billingSummary.lastPaid.status}</span>
                      </p>
                      <p>
                        Date: <span className="text-cyber-text">{new Date(billingSummary.lastPaid.createdAt).toLocaleString()}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-cyber-text-dim">No completed payments yet.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-cyber-text mb-2">Recent payment events</p>
                {billingSummary.recentPayments.length === 0 ? (
                  <p className="text-sm text-cyber-text-dim">No payment records.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="cyber-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingSummary.recentPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{new Date(payment.createdAt).toLocaleString()}</td>
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
          ) : (
            <p className="text-cyber-text-dim text-sm">Unable to load account insights.</p>
          )}
        </div>
      )}
    </div>
  );
}
