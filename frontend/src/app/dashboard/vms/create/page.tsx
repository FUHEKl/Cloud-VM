"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { saveGeneratedVmSshPrivateKey } from "@/lib/vmSshKeyStore";
import type { Plan } from "@/types";

// ──────────────────────────────────────────────────────────────────────────────
// SSH Key Modal — shown immediately after VM creation so the user can copy
// the private key before being redirected.
// The key is also persisted to localStorage for the in-browser terminal,
// but that storage is ephemeral (cleared on browser data reset) so the user
// MUST save a copy of the key themselves.
// ──────────────────────────────────────────────────────────────────────────────
function SshKeyModal({
  vmName,
  privateKey,
  onContinue,
}: {
  vmName: string;
  privateKey: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById(
        "ssh-key-textarea"
      ) as HTMLTextAreaElement | null;
      el?.select();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="cyber-card w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🔑</span>
          <div>
            <h2 className="text-xl font-bold text-cyber-text">
              Save Your SSH Private Key
            </h2>
            <p className="text-sm text-cyber-text-dim">
              VM{" "}
              <span className="text-cyber-green font-mono">{vmName}</span> is
              being provisioned
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-4 px-4 py-3 rounded-lg bg-cyber-orange/10 border border-cyber-orange/30 text-cyber-orange text-sm">
          <strong>⚠️ This is the only time you will see this key.</strong> Save
          it now — it cannot be retrieved later. You need it to SSH into your VM
          from outside the browser terminal.
        </div>

        {/* Key textarea */}
        <textarea
          id="ssh-key-textarea"
          readOnly
          value={privateKey}
          rows={10}
          className="w-full rounded-lg border border-cyber-border bg-[#060b18] text-cyber-green font-mono text-xs p-3 resize-none focus:outline-none focus:border-cyber-cyan/50 mb-3"
        />

        {/* Usage hint */}
        <p className="text-xs text-cyber-text-dim mb-4">
          Save as{" "}
          <code className="text-cyber-cyan">vm-{vmName}.pem</code> then
          connect:{" "}
          <code className="text-cyber-cyan">
            ssh -i vm-{vmName}.pem cloudvm@&lt;VM_IP&gt;
          </code>
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 cyber-btn-secondary flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg
                  className="w-4 h-4 text-cyber-green"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy to Clipboard
              </>
            )}
          </button>
          <button
            onClick={onContinue}
            className="flex-1 cyber-btn-primary flex items-center justify-center gap-2"
          >
            I&apos;ve saved my key — Continue
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Create VM page
// ──────────────────────────────────────────────────────────────────────────────
export default function CreateVmPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
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

  // SSH key modal is shown after successful VM creation so the user can
  // copy the private key BEFORE being redirected to the VM list.
  const [sshKeyModal, setSshKeyModal] = useState<{
    vmId: string;
    vmName: string;
    privateKey: string;
  } | null>(null);

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

  const selectedPlan = plans.find((p) => p.id === form.planId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = useCustom
        ? {
            name: form.name,
            osTemplate: form.osTemplate,
            cpu: form.cpu,
            ramMb: form.ramMb,
            diskGb: form.diskGb,
          }
        : {
            name: form.name,
            osTemplate: form.osTemplate,
            planId: form.planId,
            cpu: selectedPlan?.cpu || 1,
            ramMb: selectedPlan?.ramMb || 1024,
            diskGb: selectedPlan?.diskGb || 10,
          };

      const { data: createdVm } = await api.post("/vms", body);

      if (createdVm?.id && createdVm?.generatedSshPrivateKey) {
        // Persist key to localStorage so the in-browser terminal can use it
        saveGeneratedVmSshPrivateKey(
          createdVm.id,
          createdVm.generatedSshPrivateKey
        );
        // Show the SSH key modal — actual redirect happens in handleModalContinue
        setSshKeyModal({
          vmId: createdVm.id,
          vmName: createdVm.name,
          privateKey: createdVm.generatedSshPrivateKey,
        });
      } else {
        // No key returned (should not happen) — redirect immediately
        router.push("/dashboard/vms");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create VM"));
    } finally {
      setLoading(false);
    }
  };

  const handleModalContinue = () => {
    setSshKeyModal(null);
    router.push("/dashboard/vms");
  };

  return (
    <>
      {sshKeyModal && (
        <SshKeyModal
          vmName={sshKeyModal.vmName}
          privateKey={sshKeyModal.privateKey}
          onContinue={handleModalContinue}
        />
      )}

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
    </>
  );
}
