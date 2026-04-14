"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { UserProfileDetails, VmStats, VirtualMachine } from "@/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const [vmStats, setVmStats] = useState<VmStats>({
    total: 0,
    running: 0,
    stopped: 0,
    pending: 0,
    error: 0,
  });
  const [recentVms, setRecentVms] = useState<VirtualMachine[]>([]);
  const [profileDetails, setProfileDetails] = useState<UserProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");

  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);

    const [statsRes, vmsRes, profileRes] = await Promise.allSettled([
      api.get("/vms/stats"),
      api.get("/vms?limit=5"),
      api.get("/users/profile"),
    ]);

    if (statsRes.status === "fulfilled") {
      setVmStats(statsRes.value.data);
    }

    if (vmsRes.status === "fulfilled") {
      const vmData = vmsRes.value.data;
      setRecentVms(
        Array.isArray(vmData)
          ? vmData.slice(0, 5)
          : vmData.data?.slice(0, 5) || [],
      );
    }

    if (profileRes.status === "fulfilled") {
      setProfileDetails(profileRes.value.data as UserProfileDetails);
    }

    if (statsRes.status === "rejected" || vmsRes.status === "rejected") {
      if (statsRes.status === "rejected" && vmsRes.status === "rejected") {
        setLoadError(
          getErrorMessage(
            statsRes.reason,
            "Failed to load dashboard data. Please try again.",
          ),
        );
      } else {
        setLoadError(
          "Some dashboard data could not be loaded. Please try again.",
        );
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusColor: Record<string, string> = {
    RUNNING: "cyber-badge-green",
    STOPPED: "cyber-badge-red",
    PENDING: "cyber-badge-orange",
    ERROR: "cyber-badge-red",
    SUSPENDED: "cyber-badge-orange",
  };

  const statCards = [
    {
      label: "Total VMs",
      value: vmStats.total,
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
      color: "text-cyber-cyan",
      bg: "bg-cyber-cyan/10 border-cyber-cyan/20",
    },
    {
      label: "Running",
      value: vmStats.running,
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
      color: "text-cyber-green",
      bg: "bg-cyber-green/10 border-cyber-green/20",
    },
    {
      label: "Stopped",
      value: vmStats.stopped,
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ),
      color: "text-cyber-orange",
      bg: "bg-cyber-orange/10 border-cyber-orange/20",
    },
    {
      label: "Errors",
      value: vmStats.error,
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
      color: "text-cyber-red",
      bg: "bg-cyber-red/10 border-cyber-red/20",
    },
  ];

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cyber-text">
          Welcome back,{" "}
          <span className="text-cyber-green">{user?.firstName}</span>
        </h1>
        <p className="text-cyber-text-dim mt-1">
          Here&apos;s an overview of your cloud infrastructure
        </p>

        {loadError && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button
              onClick={load}
              className="text-cyber-red underline hover:no-underline text-xs"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="cyber-card flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-lg ${card.bg} border flex items-center justify-center ${card.color}`}
            >
              {card.icon}
            </div>
            <div>
              <div className="text-2xl font-bold text-cyber-text">
                {loading ? "-" : card.value}
              </div>
              <div className="text-sm text-cyber-text-dim">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {profileDetails?.usage && profileDetails?.subscription && (
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="cyber-card">
            <h3 className="text-sm font-semibold text-cyber-text mb-3">Resource Usage (current)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-cyber-text-dim">CPU in use</p>
                <p className="text-cyber-text font-semibold">{profileDetails.usage.cpuUsed} vCPU</p>
              </div>
              <div>
                <p className="text-cyber-text-dim">RAM in use</p>
                <p className="text-cyber-text font-semibold">{(profileDetails.usage.ramMbUsed / 1024).toFixed(2)} GB</p>
              </div>
              <div>
                <p className="text-cyber-text-dim">Disk in use</p>
                <p className="text-cyber-text font-semibold">{profileDetails.usage.diskGbUsed} GB</p>
              </div>
              <div>
                <p className="text-cyber-text-dim">VM count</p>
                <p className="text-cyber-text font-semibold">{profileDetails.usage.vmCount}</p>
              </div>
            </div>
          </div>

          <div className="cyber-card">
            <h3 className="text-sm font-semibold text-cyber-text mb-3">Plan Consumption</h3>
            <div className="space-y-2 text-sm">
              <p>
                Plan: <span className="text-cyber-cyan uppercase font-semibold">{profileDetails.subscription.planId}</span>
              </p>
              <p>
                VM hours used: <span className="text-cyber-text font-semibold">{profileDetails.subscription.vmHoursUsed.toFixed(2)}</span>
              </p>
              <p>
                VM hours remaining: <span className="text-cyber-green font-semibold">{profileDetails.subscription.vmHoursRemaining.toFixed(2)}</span>
              </p>
              <p>
                Cycle ends: <span className="text-cyber-text">{new Date(profileDetails.subscription.cycleEndsAt).toLocaleDateString()}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions + Recent VMs */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="cyber-card">
          <h3 className="text-lg font-semibold text-cyber-text mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <Link
              href="/dashboard/vms/create"
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-cyber-border hover:border-cyber-green/30 hover:bg-cyber-green/5 transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-lg bg-cyber-green/10 border border-cyber-green/20 flex items-center justify-center text-cyber-green">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-cyber-text">
                  Create VM
                </div>
                <div className="text-xs text-cyber-text-dim">
                  Launch a new virtual machine
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/ssh-keys"
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-cyber-border hover:border-cyber-cyan/30 hover:bg-cyber-cyan/5 transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center text-cyber-cyan">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-cyber-text">
                  SSH Keys
                </div>
                <div className="text-xs text-cyber-text-dim">
                  Manage your SSH keys
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/profile"
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-cyber-border hover:border-cyber-cyan/30 hover:bg-cyber-cyan/5 transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center text-cyber-cyan">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-cyber-text">
                  Profile
                </div>
                <div className="text-xs text-cyber-text-dim">
                  Update your profile
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent VMs */}
        <div className="lg:col-span-2 cyber-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-cyber-text">
              Recent Virtual Machines
            </h3>
            <Link
              href="/dashboard/vms"
              className="text-sm text-cyber-cyan hover:text-cyber-green transition-colors"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-8 text-cyber-text-dim">
              Loading...
            </div>
          ) : recentVms.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-cyber-text-dim mb-4">
                No virtual machines yet
              </div>
              <Link
                href="/dashboard/vms/create"
                className="cyber-btn-primary text-sm !px-4 !py-2"
              >
                Create Your First VM
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="cyber-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>IP Address</th>
                    <th>Resources</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVms.map((vm) => (
                    <tr key={vm.id}>
                      <td>
                        <Link
                          href={`/dashboard/vms/${vm.id}`}
                          className="text-cyber-cyan hover:text-cyber-green transition-colors font-medium"
                        >
                          {vm.name}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={statusColor[vm.status] || "cyber-badge"}
                        >
                          {vm.status}
                        </span>
                      </td>
                      <td className="text-cyber-text-dim font-mono text-sm">
                        {vm.ipAddress || "—"}
                      </td>
                      <td className="text-cyber-text-dim text-sm">
                        {vm.cpu} vCPU · {vm.ramMb / 1024}GB · {vm.diskGb}GB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
