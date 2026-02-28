"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import type { VirtualMachine } from "@/types";

export default function VmsListPage() {
  const [vms, setVms] = useState<VirtualMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadVms = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await api.get(`/vms?${params}`);
      setVms(Array.isArray(data) ? data : data.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVms();
  }, [search, statusFilter]);

  const handleAction = async (vmId: string, action: string) => {
    if (action === "delete" && !confirm("Delete this VM?")) return;
    try {
      if (action === "delete") {
        await api.delete(`/vms/${vmId}`);
      } else {
        await api.post(`/vms/${vmId}/action`, { action });
      }
      await loadVms();
    } catch {
      // silent
    }
  };

  const statusBadge: Record<string, string> = {
    RUNNING: "cyber-badge-green",
    STOPPED: "cyber-badge-red",
    PENDING: "cyber-badge-orange",
    ERROR: "cyber-badge-red",
    SUSPENDED: "cyber-badge-orange",
    DELETED: "cyber-badge-red",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text">
            Virtual Machines
          </h1>
          <p className="text-cyber-text-dim mt-1">
            Manage your cloud instances
          </p>
        </div>
        <Link
          href="/dashboard/vms/create"
          className="cyber-btn-primary !py-2.5 flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create VM
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          className="cyber-input max-w-xs"
          placeholder="Search VMs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="cyber-input max-w-[160px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="RUNNING">Running</option>
          <option value="STOPPED">Stopped</option>
          <option value="PENDING">Pending</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      {/* VMs Grid */}
      {loading ? (
        <div className="text-center py-12 text-cyber-text-dim">Loading...</div>
      ) : vms.length === 0 ? (
        <div className="cyber-card text-center py-16">
          <div className="w-20 h-20 rounded-full bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-cyber-cyan"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-cyber-text mb-2">
            No Virtual Machines
          </h3>
          <p className="text-cyber-text-dim mb-6">
            Create your first VM to get started
          </p>
          <Link href="/dashboard/vms/create" className="cyber-btn-primary">
            Create VM
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vms.map((vm) => (
            <div key={vm.id} className="cyber-card-hover">
              <div className="flex items-center justify-between mb-3">
                <Link
                  href={`/dashboard/vms/${vm.id}`}
                  className="font-semibold text-cyber-text hover:text-cyber-green transition-colors"
                >
                  {vm.name}
                </Link>
                <span className={statusBadge[vm.status] || "cyber-badge"}>
                  {vm.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-cyber-text-dim mb-4">
                <div className="flex justify-between">
                  <span>OS Template</span>
                  <span className="text-cyber-text">{vm.osTemplate}</span>
                </div>
                <div className="flex justify-between">
                  <span>IP Address</span>
                  <span className="font-mono text-cyber-cyan">
                    {vm.ipAddress || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Resources</span>
                  <span className="text-cyber-text">
                    {vm.cpu} vCPU ·{" "}
                    {vm.ramMb >= 1024
                      ? `${vm.ramMb / 1024}GB`
                      : `${vm.ramMb}MB`}{" "}
                    · {vm.diskGb}GB
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-3 border-t border-cyber-border/50">
                {vm.status === "RUNNING" && (
                  <>
                    <Link
                      href={`/dashboard/vms/${vm.id}`}
                      className="flex-1 text-center text-sm py-1.5 rounded-md bg-cyber-green/10 text-cyber-green border border-cyber-green/20 hover:bg-cyber-green/20 transition-colors"
                    >
                      Terminal
                    </Link>
                    <button
                      onClick={() => handleAction(vm.id, "stop")}
                      className="flex-1 text-center text-sm py-1.5 rounded-md bg-cyber-orange/10 text-cyber-orange border border-cyber-orange/20 hover:bg-cyber-orange/20 transition-colors"
                    >
                      Stop
                    </button>
                  </>
                )}
                {vm.status === "STOPPED" && (
                  <>
                    <button
                      onClick={() => handleAction(vm.id, "start")}
                      className="flex-1 text-center text-sm py-1.5 rounded-md bg-cyber-green/10 text-cyber-green border border-cyber-green/20 hover:bg-cyber-green/20 transition-colors"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => handleAction(vm.id, "delete")}
                      className="flex-1 text-center text-sm py-1.5 rounded-md bg-cyber-red/10 text-cyber-red border border-cyber-red/20 hover:bg-cyber-red/20 transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
                {(vm.status === "PENDING" || vm.status === "ERROR") && (
                  <button
                    onClick={() => handleAction(vm.id, "delete")}
                    className="flex-1 text-center text-sm py-1.5 rounded-md bg-cyber-red/10 text-cyber-red border border-cyber-red/20 hover:bg-cyber-red/20 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
