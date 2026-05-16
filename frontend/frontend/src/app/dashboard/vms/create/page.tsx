"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import {
  downloadPrivateKeyAsPem,
  getUserGeneratedSshPrivateKey,
  hasDownloadedGeneratedSshPrivateKey,
  markGeneratedSshPrivateKeyDownloaded,
  saveGeneratedVmSshPrivateKey,
  saveUserGeneratedSshPrivateKey,
} from "@/lib/vmSshKeyStore";
import type { GeneratedSshKeyResponse, Plan, SshKey } from "@/types";

// ──────────────────────────────────────────────────────────────────────────────
// Create VM page
// ──────────────────────────────────────────────────────────────────────────────
export default function CreateVmPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKey[]>([]);
  const [sshKeysLoading, setSshKeysLoading] = useState(true);
  const [sshMode, setSshMode] = useState<"existing" | "generate-new">(
    "generate-new",
  );
  const [selectedSshKeyId, setSelectedSshKeyId] = useState("");
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
    planId: "",
  });
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSshKeys = async () => {
    try {
      const { data } = await api.get("/ssh-keys");
      const list = Array.isArray(data) ? data : [];
      setSshKeys(list);
      if (list.length > 0) {
        setSshMode("existing");
        setSelectedSshKeyId((prev) => prev || list[0].id);
      } else {
        setSshMode("generate-new");
        setSelectedSshKeyId("");
      }
    } catch {
      setSshKeys([]);
      setSshMode("generate-new");
      setSelectedSshKeyId("");
    } finally {
      setSshKeysLoading(false);
    }
  };

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

  useEffect(() => {
    api
      .get("/plans")
      .then(({ data }) => {
        const p = Array.isArray(data) ? data : data.data || [];
        setPlans(p);
        if (p.length > 0) setForm((f) => ({ ...f, planId: p[0].id }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSshKeys();
  }, []);

  const selectedPlan = plans.find((p) => p.id === form.planId);
  const selectedSshKey = sshKeys.find((key) => key.id === selectedSshKeyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      let selectedPublicKey = "";
      let selectedPrivateKey: string | null = null;

      if (sshMode === "existing" && selectedSshKey) {
        selectedPublicKey = selectedSshKey.publicKey;
        selectedPrivateKey = getUserGeneratedSshPrivateKey(selectedSshKey.id);
      } else {
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
      }

      if (!selectedPublicKey) {
        throw new Error("Please select or generate an SSH key");
      }

      const body = useCustom
        ? {
            name: form.name,
            osTemplate: form.osTemplate,
            cpu: form.cpu,
            ramMb: form.ramMb,
            diskGb: form.diskGb,
            sshPublicKey: selectedPublicKey,
          }
        : {
            name: form.name,
            osTemplate: form.osTemplate,
            planId: form.planId,
            cpu: selectedPlan?.cpu || 1,
            ramMb: selectedPlan?.ramMb || 1024,
            diskGb: selectedPlan?.diskGb || 10,
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

          {/* Plan / Custom Resources */}
          <div className="cyber-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cyber-text">
                Resources
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                  className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-cyber-green focus:ring-cyber-green"
                />
                <span className="text-sm text-cyber-text-dim">
                  Custom config
                </span>
              </label>
            </div>

            {!useCustom ? (
              <div className="grid sm:grid-cols-3 gap-3">
                {plans.length === 0 ? (
                  <p className="text-cyber-text-dim text-sm col-span-3">
                    No plans available. Use custom configuration.
                  </p>
                ) : (
                  plans.map((plan) => (
                    <button
                      type="button"
                      key={plan.id}
                      onClick={() => setForm({ ...form, planId: plan.id })}
                      className={`p-4 rounded-lg border text-left transition-all duration-200 ${
                        form.planId === plan.id
                          ? "border-cyber-green bg-cyber-green/10 shadow-glow-green"
                          : "border-cyber-border hover:border-cyber-cyan/30"
                      }`}
                    >
                      <div className="font-semibold text-cyber-text mb-2">
                        {plan.name}
                      </div>
                      <div className="space-y-1 text-sm text-cyber-text-dim">
                        <div>{plan.cpu} vCPU</div>
                        <div>
                          {plan.ramMb >= 1024
                            ? `${plan.ramMb / 1024} GB`
                            : `${plan.ramMb} MB`}{" "}
                          RAM
                        </div>
                        <div>{plan.diskGb} GB Disk</div>
                      </div>
                      <div className="mt-3 text-cyber-green font-semibold">
                        {plan.priceMonthly === 0
                          ? "Free"
                          : `${plan.priceMonthly.toLocaleString()} TND/mo`}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
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
            )}
          </div>

          {/* SSH Key Access */}
          <div className="cyber-card">
            <h3 className="text-lg font-semibold text-cyber-text mb-4">
              SSH Access Key
            </h3>

            {sshKeysLoading ? (
              <p className="text-sm text-cyber-text-dim">Loading SSH keys...</p>
            ) : (
              <div className="space-y-4">
                {sshKeys.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-cyber-text cursor-pointer">
                    <input
                      type="radio"
                      name="ssh-mode"
                      checked={sshMode === "existing"}
                      onChange={() => setSshMode("existing")}
                      className="accent-cyber-green"
                    />
                    Use an existing SSH key
                  </label>
                )}

                {sshMode === "existing" && sshKeys.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-cyber-text-dim mb-1.5">
                      Select key
                    </label>
                    <select
                      className="cyber-input"
                      value={selectedSshKeyId}
                      onChange={(e) => setSelectedSshKeyId(e.target.value)}
                      required
                    >
                      {sshKeys.map((key) => (
                        <option key={key.id} value={key.id}>
                          {key.name} ({key.fingerprint})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-cyber-text-dim mt-2">
                      This key will be used for VM access. No new private key download
                      is triggered for existing keys.
                    </p>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-cyber-text cursor-pointer">
                  <input
                    type="radio"
                    name="ssh-mode"
                    checked={sshMode === "generate-new"}
                    onChange={() => setSshMode("generate-new")}
                    className="accent-cyber-green"
                  />
                  Generate a new SSH key now (recommended if none exists)
                </label>

                {sshMode === "generate-new" && (
                  <p className="text-xs text-cyber-text-dim">
                    A new key will be generated automatically before VM creation,
                    added to your SSH Keys page, and its private key will download once.
                  </p>
                )}
              </div>
            )}
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
