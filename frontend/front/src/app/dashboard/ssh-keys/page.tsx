"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import {
  downloadPrivateKeyAsPem,
  hasDownloadedGeneratedSshPrivateKey,
  markGeneratedSshPrivateKeyDownloaded,
  saveUserGeneratedSshPrivateKey,
} from "@/lib/vmSshKeyStore";
import type { GeneratedSshKeyResponse, SshKey } from "@/types";

export default function SshKeysPage() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", publicKey: "" });
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedKey, setSelectedKey] = useState<SshKey | null>(null);
  const [copiedPublic, setCopiedPublic] = useState(false);

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
    setSuccess("");
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

  const handleGenerateKey = async () => {
    setError("");
    setSuccess("");
    setGenerating(true);
    try {
      const generatedName = `Auto Key ${new Date().toLocaleDateString()}`;
      const { data } = await api.post<GeneratedSshKeyResponse>(
        "/ssh-keys/generate",
        { name: generatedName },
      );

      if (data?.key?.id && data?.privateKey) {
        saveUserGeneratedSshPrivateKey(data.key.id, data.privateKey, data.filename);

        if (!hasDownloadedGeneratedSshPrivateKey(data.key.id) && data.filename) {
          downloadPrivateKeyAsPem(data.filename, data.privateKey);
          markGeneratedSshPrivateKeyDownloaded(data.key.id);
        }

        setSuccess(
          "SSH key generated. Private key download started once — save it securely.",
        );
      }

      await loadKeys();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to generate SSH key"));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPublicKey = async (publicKey: string) => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 1800);
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

      <div className="cyber-card mb-6 !p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-cyber-text">
              Quick start (recommended)
            </h3>
            <p className="text-sm text-cyber-text-dim mt-1">
              Don&apos;t have an SSH key? Generate one automatically in one click.
              We save your public key and trigger a one-time private key download.
            </p>
          </div>
          <button
            onClick={handleGenerateKey}
            disabled={generating}
            className="cyber-btn-secondary !py-2.5"
          >
            {generating ? "Generating..." : "Generate Key For Me"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-red/10 border border-cyber-red/30 text-cyber-red text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-sm">
          {success}
        </div>
      )}

      {/* Add Key Form */}
      {showForm && (
        <div className="cyber-card mb-6">
          <h3 className="text-lg font-semibold text-cyber-text mb-4">
            Add New SSH Key
          </h3>

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
            Add an SSH public key to securely connect to your VMs, or auto-generate one.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleGenerateKey}
              disabled={generating}
              className="cyber-btn-primary !py-2.5"
            >
              {generating ? "Generating..." : "Generate Key For Me"}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="cyber-btn-secondary !py-2.5"
            >
              Add Manually
            </button>
          </div>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedKey(key)}
                  className="px-3 py-1.5 text-xs rounded-md border border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10 transition-colors"
                  title="View key details"
                >
                  View
                </button>
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
            </div>
          ))}
        </div>
      )}

      {selectedKey && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg cyber-card border border-cyber-cyan/30">
            <h3 className="text-lg font-semibold text-cyber-text mb-2">
              SSH key details
            </h3>
            <div className="text-sm text-cyber-text-dim mb-2">
              Name: <span className="text-cyber-text">{selectedKey.name}</span>
            </div>
            <div className="text-xs text-cyber-text-dim font-mono mb-4 break-all">
              Fingerprint: {selectedKey.fingerprint}
            </div>

            <label className="block text-xs font-medium text-cyber-text-dim mb-1.5">
              Public key
            </label>
            <textarea
              readOnly
              value={selectedKey.publicKey}
              className="cyber-input !h-36 font-mono text-xs mb-4"
            />

            <div className="mb-4 text-xs text-cyber-text-dim">
              Private keys are never shown again for security. If you lose yours,
              generate a new key and remove the old one.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleCopyPublicKey(selectedKey.publicKey)}
                className="cyber-btn-secondary !py-2.5"
              >
                {copiedPublic ? "Copied" : "Copy Public Key"}
              </button>
              <button
                onClick={() => setSelectedKey(null)}
                className="cyber-btn-primary !py-2.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
