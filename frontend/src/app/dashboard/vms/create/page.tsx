"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import {
  downloadPrivateKeyAsPem,
  hasDownloadedGeneratedSshPrivateKey,
  markGeneratedSshPrivateKeyDownloaded,
  saveGeneratedVmSshPrivateKey,
  saveUserGeneratedSshPrivateKey,
} from "@/lib/vmSshKeyStore";
import type { GeneratedSshKeyResponse } from "@/types";

// ──────────────────────────────────────────────────────────────────────────────
// Create VM page
// ──────────────────────────────────────────────────────────────────────────────
export default function CreateVmPage() {
  const router = useRouter();
  const [osTemplates, setOsTemplates] = useState<
    { id: number; name: string }[]
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    osTemplate: "",
    cpu: 1,
    ramMb: 1024,
    diskGb: 10,
    vmUsername: "cloudvm",
    vmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api
      .get("/vms/templates")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setOsTemplates(list);
        if (list.length > 0) {
          setForm((f) => ({ ...f, osTemplate: list[0].name }));
        }
      })
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      let selectedPublicKey = "";
      let selectedPrivateKey: string | null = null;

      const generatedName = form.name?.trim()
        ? `${form.name}-key`
        : `vm-key-${new Date().toISOString().slice(0, 10)}`;

      const { data } = await api.post<GeneratedSshKeyResponse>(
        "/ssh-keys/generate",
        { name: generatedName },
      );

      if (!data?.key?.id || !data?.key?.publicKey || !data?.privateKey) {
        throw new Error("Generated SSH key response is incomplete");
      }

      selectedPublicKey = data.key.publicKey;
      selectedPrivateKey = data.privateKey;

      saveUserGeneratedSshPrivateKey(data.key.id, data.privateKey, data.filename);

      if (!hasDownloadedGeneratedSshPrivateKey(data.key.id) && data.filename) {
        downloadPrivateKeyAsPem(data.filename, data.privateKey);
        markGeneratedSshPrivateKeyDownloaded(data.key.id);
      }

      if (!selectedPublicKey) {
        throw new Error("Please select or generate an SSH key");
      }

      const body = {
        name: form.name,
        osTemplate: form.osTemplate,
        cpu: form.cpu,
        ramMb: form.ramMb,
        diskGb: form.diskGb,
        vmUsername: form.vmUsername,
        vmPassword: form.vmPassword || undefined,
        sshPublicKey: selectedPublicKey,
      };

      const { data: createdVm } = await api.post("/vms", body);

      if (createdVm?.id && selectedPrivateKey) {
        saveGeneratedVmSshPrivateKey(createdVm.id, selectedPrivateKey);
      }

      setSuccess("VM created successfully. Redirecting...");
      router.push("/dashboard/vms");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create VM"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-cyber-text mb-2">
          Create Virtual Machine
        </h1>
        <p className="text-cyber-text-dim mb-6">
          Configure and launch a new VM instance
        </p>

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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* VM Name */}
          <div className="cyber-card">
            <h3 className="text-lg font-semibold text-cyber-text mb-4">
              Basic Info
            </h3>
            <div>
              <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                VM Name
              </label>
              <input
                type="text"
                className="cyber-input"
                placeholder="my-server"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* OS Template */}
          <div className="cyber-card">
            <h3 className="text-lg font-semibold text-cyber-text mb-4">
              Operating System
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {templatesLoading ? (
                <p className="text-sm text-cyber-text-dim col-span-3">
                  Loading templates from OpenNebula...
                </p>
              ) : osTemplates.length === 0 ? (
                <p className="text-sm text-cyber-text-dim col-span-3">
                  No templates available. Contact an administrator.
                </p>
              ) : (
                osTemplates.map((os) => (
                  <button
                    type="button"
                    key={os.name}
                    onClick={() => setForm({ ...form, osTemplate: os.name })}
                    className={`p-3 rounded-lg border text-left transition-all duration-200 ${
                      form.osTemplate === os.name
                        ? "border-cyber-green bg-cyber-green/10 shadow-glow-green"
                        : "border-cyber-border hover:border-cyber-cyan/30"
                    }`}
                  >
                    <div className="text-xl mb-1">💿</div>
                    <div className="text-sm font-medium text-cyber-text">
                      {os.name}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Resources */}
          <div className="cyber-card">
            <h3 className="text-lg font-semibold text-cyber-text mb-4">
              Resources
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  CPU Cores:{" "}
                  <span className="text-cyber-green">{form.cpu}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={form.cpu}
                  onChange={(e) =>
                    setForm({ ...form, cpu: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>1</span>
                  <span>16</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  RAM:{" "}
                  <span className="text-cyber-green">
                    {form.ramMb >= 1024
                      ? `${form.ramMb / 1024} GB`
                      : `${form.ramMb} MB`}
                  </span>
                </label>
                <input
                  type="range"
                  min="512"
                  max="32768"
                  step="512"
                  value={form.ramMb}
                  onChange={(e) =>
                    setForm({ ...form, ramMb: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>512 MB</span>
                  <span>32 GB</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  Disk:{" "}
                  <span className="text-cyber-green">{form.diskGb} GB</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={form.diskGb}
                  onChange={(e) =>
                    setForm({ ...form, diskGb: parseInt(e.target.value) })
                  }
                  className="w-full accent-cyber-green"
                />
                <div className="flex justify-between text-xs text-cyber-text-dim mt-1">
                  <span>10 GB</span>
                  <span>500 GB</span>
                </div>
              </div>
            </div>
          </div>

          {/* VM Login Credentials */}
          <div className="cyber-card space-y-4">
            <h3 className="text-lg font-semibold text-cyber-text">
              VM Login Credentials
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  className="cyber-input"
                  placeholder="cloudvm"
                  value={form.vmUsername}
                  onChange={(e) =>
                    setForm({ ...form, vmUsername: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  className="cyber-input"
                  placeholder="Set a login password"
                  value={form.vmPassword}
                  onChange={(e) =>
                    setForm({ ...form, vmPassword: e.target.value })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-cyber-text-dim">
              These credentials are used by the VM init script to create the login
              account for SSH and the GUI connection.
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="cyber-btn-primary flex-1"
            >
              {loading ? "Creating..." : "Create Virtual Machine"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="cyber-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
  );
}
