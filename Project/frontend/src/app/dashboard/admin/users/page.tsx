"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { User, UserStats } from "@/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    active: 0,
    newThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggleActive = async (userId: string, isActive: boolean) => {
    try {
      await api.patch(`/users/${userId}`, { isActive: !isActive });
      await loadUsers();
    } catch {
      // silent
    }
  };

  const changeRole = async (userId: string, role: string) => {
    const newRole = role === "ADMIN" ? "USER" : "ADMIN";
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      await loadUsers();
    } catch {
      // silent
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await api.delete(`/users/${userId}`);
      await loadUsers();
    } catch {
      // silent
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
                      onClick={() => changeRole(u.id, u.role)}
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
                      onClick={() => toggleActive(u.id, u.isActive)}
                      className={
                        u.isActive
                          ? "cyber-badge-green cursor-pointer"
                          : "cyber-badge-red cursor-pointer"
                      }
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="text-cyber-text-dim text-sm">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
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
    </div>
  );
}
