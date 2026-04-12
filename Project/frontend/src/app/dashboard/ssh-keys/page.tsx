"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import type { SshKey } from "@/types";

export default function SshKeysPage() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", publicKey: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadKeys = async () => {
    try {
      const { data } = await api.get("/ssh-keys");
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/ssh-keys", form);
      setForm({ name: "", publicKey: "" });
      setShowForm(false);
      await loadKeys();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to add SSH key"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this SSH key?")) return;
    try {
      await api.delete(`/ssh-keys/${id}`);
      await loadKeys();
    } catch {
      // silent
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text">SSH Keys</h1>
          <p className="text-cyber-text-dim mt-1">
            Manage your SSH public keys for VM access
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
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
          Add SSH Key
        </button>
      </div>

      {/* Add Key Form */}
      {showForm && (
        <div className="cyber-card mb-6">
          <h3 className="text-lg font-semibold text-cyber-text mb-4">
            Add New SSH Key
          </h3>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Key Name
              </label>
              <input
                type="text"
                className="cyber-input"
                placeholder="e.g., My Laptop"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                Public Key
              </label>
              <textarea
                className="cyber-input !h-28 font-mono text-sm"
                placeholder="ssh-rsa AAAAB3... or ssh-ed25519 AAAAC3..."
                value={form.publicKey}
                onChange={(e) =>
                  setForm({ ...form, publicKey: e.target.value })
                }
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="cyber-btn-primary !py-2.5"
              >
                {submitting ? "Adding..." : "Add Key"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                className="cyber-btn-secondary !py-2.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Keys List */}
      {loading ? (
        <div className="text-center py-12 text-cyber-text-dim">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="cyber-card text-center py-12">
          <div className="w-16 h-16 rounded-full bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-cyber-cyan"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-cyber-text mb-2">
            No SSH Keys
          </h3>
          <p className="text-cyber-text-dim mb-4">
            Add an SSH public key to securely connect to your VMs.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="cyber-btn-primary !py-2.5"
          >
            Add Your First Key
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className="cyber-card-hover flex items-center justify-between !p-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center text-cyber-cyan flex-shrink-0">
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-cyber-text">{key.name}</div>
                  <div className="text-xs text-cyber-text-dim font-mono truncate">
                    {key.fingerprint}
                  </div>
                  <div className="text-xs text-cyber-text-dim mt-0.5">
                    Added {new Date(key.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(key.id)}
                className="text-cyber-text-dim hover:text-cyber-red transition-colors p-2"
                title="Delete key"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
