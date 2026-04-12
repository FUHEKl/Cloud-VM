"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import type { VirtualMachine } from "@/types";
import { useVmSocket } from "@/hooks/useVmSocket";

const Terminal = dynamic(() => import("@/components/terminal/Terminal"), {
  ssr: false,
});

const statusConfig: Record<
  string,
  { color: string; pulse: boolean; label: string }
> = {
  RUNNING:  { color: "text-cyber-green",  pulse: true,  label: "Running"         },
  STOPPED:  { color: "text-gray-400",     pulse: false, label: "Stopped"         },
  PENDING:  { color: "text-cyber-orange", pulse: true,  label: "Pending"         },
  PROLOG:   { color: "text-cyber-cyan",   pulse: true,  label: "Preparing disk…" },
  BOOT:     { color: "text-cyber-cyan",   pulse: true,  label: "Booting…"        },
  MIGRATE:  { color: "text-cyber-cyan",   pulse: true,  label: "Migrating…"      },
  SHUTDOWN: { color: "text-cyber-orange", pulse: true,  label: "Shutting down…"  },
  ERROR:    { color: "text-cyber-red",    pulse: false, label: "Error"           },
  DELETED:  { color: "text-gray-600",     pulse: false, label: "Deleted"         },
};

export default function VmDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [vm, setVm]                   = useState<VirtualMachine | null>(null);
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [showTerminal, setShowTerminal]   = useState(false);
  const [error, setError]             = useState("");

  const fetchVm = useCallback(async () => {
    try {
      const { data } = await api.get(`/vms/${id}`);
      setVm(data);
    } catch {
      setError("VM not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVm();
    const interval = setInterval(fetchVm, 10000);
    return () => clearInterval(interval);
  }, [fetchVm]);

  // Real-time status updates via WebSocket — instant, no 10s wait
  useVmSocket((update) => {
    if (update.vmId !== id) return;

    if (update.status === "DELETED") {
      router.push("/dashboard/vms");
      return;
    }

    setVm((prev) =>
      prev
        ? {
            ...prev,
            status:    update.status as VirtualMachine["status"],
            ipAddress: update.ipAddress ?? prev.ipAddress,
            oneVmId:   update.oneVmId   ?? prev.oneVmId,
            sshHost:   update.sshHost   ?? prev.sshHost,
            updatedAt: new Date().toISOString(),
          }
        : prev,
    );
  });

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      await api.post(`/vms/${id}/action`, { action });
      await fetchVm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, `Failed to ${action} VM`));
    } finally {
      setActionLoading("");
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this VM? This action cannot be undone.",
      )
    )
      return;
    setActionLoading("delete");
    try {
      await api.delete(`/vms/${id}`);
      router.push("/dashboard/vms");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to delete VM"));
      setActionLoading("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyber-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !vm) {
    return (
      <div className="cyber-card text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl text-cyber-red font-semibold">{error}</h2>
        <button
          onClick={() => router.push("/dashboard/vms")}
          className="cyber-btn-primary mt-4"
        >
          Back to VMs
        </button>
      </div>
    );
  }

  if (!vm) return null;

  const cfg       = statusConfig[vm.status] ?? statusConfig.PENDING;
  const isRunning = vm.status === "RUNNING";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-cyber-text">{vm.name}</h1>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${cfg.color}`}
            >
              {cfg.pulse && (
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              )}
              {cfg.label}
            </span>
          </div>
          <p className="text-cyber-text-dim text-sm">
            Created{" "}
            {new Date(vm.createdAt).toLocaleDateString("en-US", {
              year:  "numeric",
              month: "long",
              day:   "numeric",
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isRunning && (
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className="cyber-btn-primary text-sm"
            >
              {showTerminal ? "✕ Close Terminal" : "⚡ Open Terminal"}
            </button>
          )}
          {isRunning && (
            <>
              <button
                onClick={() => handleAction("restart")}
                disabled={!!actionLoading}
                className="px-4 py-2 text-sm rounded-lg border border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10 transition disabled:opacity-50"
              >
                {actionLoading === "restart" ? "Restarting..." : "↻ Restart"}
              </button>
              <button
                onClick={() => handleAction("stop")}
                disabled={!!actionLoading}
                className="px-4 py-2 text-sm rounded-lg border border-cyber-orange/30 text-cyber-orange hover:bg-cyber-orange/10 transition disabled:opacity-50"
              >
                {actionLoading === "stop" ? "Stopping..." : "■ Stop"}
              </button>
            </>
          )}
          {vm.status === "STOPPED" && (
            <button
              onClick={() => handleAction("start")}
              disabled={!!actionLoading}
              className="cyber-btn-primary text-sm"
            >
              {actionLoading === "start" ? "Starting..." : "▶ Start"}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={!!actionLoading}
            className="px-4 py-2 text-sm rounded-lg border border-cyber-red/30 text-cyber-red hover:bg-cyber-red/10 transition disabled:opacity-50"
          >
            {actionLoading === "delete" ? "Deleting..." : "🗑 Delete"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      {/* Terminal */}
      {showTerminal && isRunning && vm.ipAddress && (
        <div className="cyber-card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-cyber-border bg-cyber-bg-card/80">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-cyber-green animate-pulse" />
              <span className="text-cyber-text font-medium">Terminal</span>
              <span className="text-cyber-text-dim">— {vm.ipAddress}</span>
            </div>
            <button
              onClick={() => setShowTerminal(false)}
              className="text-cyber-text-dim hover:text-cyber-red transition"
            >
              ✕
            </button>
          </div>
          <Terminal
            vmId={vm.id}
            ipAddress={vm.ipAddress}
            onDisconnect={() => setShowTerminal(false)}
          />
        </div>
      )}

      {showTerminal && isRunning && !vm.ipAddress && (
        <div className="cyber-card text-center py-8">
          <p className="text-cyber-orange text-sm">
            ⏳ VM is running but IP address is not assigned yet. Please wait...
          </p>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Specs */}
        <div className="cyber-card space-y-4">
          <h3 className="text-lg font-semibold text-cyber-text">
            Specifications
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-cyber-border/50">
              <span className="text-cyber-text-dim">OS Template</span>
              <span className="text-cyber-text font-medium">
                {vm.osTemplate}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-cyber-border/50">
              <span className="text-cyber-text-dim">vCPU</span>
              <span className="text-cyber-text font-medium">
                {vm.cpu} Cores
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-cyber-border/50">
              <span className="text-cyber-text-dim">RAM</span>
              <span className="text-cyber-text font-medium">
                {vm.ramMb >= 1024
                  ? `${(vm.ramMb / 1024).toFixed(1)} GB`
                  : `${vm.ramMb} MB`}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-cyber-text-dim">Disk</span>
              <span className="text-cyber-text font-medium">
                {vm.diskGb} GB
              </span>
            </div>
          </div>
        </div>

        {/* Network */}
        <div className="cyber-card space-y-4">
          <h3 className="text-lg font-semibold text-cyber-text">Network</h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-cyber-border/50">
              <span className="text-cyber-text-dim">IP Address</span>
              <span className="text-cyber-green font-mono font-medium">
                {vm.ipAddress || "—"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-cyber-border/50">
              <span className="text-cyber-text-dim">VM ID (OpenNebula)</span>
              <span className="text-cyber-text font-mono">
                {vm.oneVmId ?? "—"}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-cyber-text-dim">Status</span>
              <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timestamps */}
      <div className="cyber-card">
        <h3 className="text-lg font-semibold text-cyber-text mb-4">Timeline</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-cyber-text-dim">Created</span>
            <p className="text-cyber-text mt-0.5">
              {new Date(vm.createdAt).toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-cyber-text-dim">Last Updated</span>
            <p className="text-cyber-text mt-0.5">
              {new Date(vm.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
