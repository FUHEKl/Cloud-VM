"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import api from "@/lib/api";

interface MfaSetupResponse {
  mfaEnabled: boolean;
  setupExpiresInSeconds: number;
  secret: string;
  otpAuthUrl: string;
  issuer: string;
  accountName: string;
}

interface MfaStatusResponse {
  mfaEnabled: boolean;
  mfaEnabledAt: string | null;
  recoveryCodesRemaining: number;
  recoveryCodesGeneratedAt: string | null;
}

interface MfaAuditItem {
  action: string;
  ip: string;
  userAgent: string;
  createdAt: string;
}

interface RecoveryCodesResponse {
  recoveryCodes: string[];
  recoveryCodesGeneratedAt: string;
}

interface MfaSettingsPanelProps {
  title?: string;
  description?: string;
}

export default function MfaSettingsPanel({
  title = "Multi-Factor Authentication",
  description = "Protect your account with an authenticator app and recovery codes.",
}: MfaSettingsPanelProps) {
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [audit, setAudit] = useState<MfaAuditItem[]>([]);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingEnable, setLoadingEnable] = useState(false);
  const [loadingDisable, setLoadingDisable] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRegenCodes, setLoadingRegenCodes] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const canRunSensitiveAction = password.trim().length >= 8;

  const hasSetupSession = useMemo(() => Boolean(setup?.otpAuthUrl), [setup?.otpAuthUrl]);

  useEffect(() => {
    let active = true;

    const buildQr = async () => {
      if (!setup?.otpAuthUrl) {
        setQrDataUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setup.otpAuthUrl, {
          width: 220,
          margin: 1,
        });

        if (active) setQrDataUrl(dataUrl);
      } catch {
        if (active) {
          setQrDataUrl("");
          setError("Failed to generate QR image. You can still use the manual secret below.");
        }
      }
    };

    buildQr();

    return () => {
      active = false;
    };
  }, [setup?.otpAuthUrl]);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const [{ data: statusData }, { data: auditData }] = await Promise.all([
        api.get<MfaStatusResponse>("/auth/mfa/status"),
        api.get<MfaAuditItem[]>("/auth/mfa/audit"),
      ]);
      setStatus(statusData);
      setAudit(auditData || []);
    } catch {
      setStatus(null);
      setAudit([]);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const resetFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const startSetup = async () => {
    resetFeedback();
    if (!canRunSensitiveAction) {
      setError("Enter your current password to set up or rotate MFA.");
      return;
    }

    setLoadingSetup(true);
    try {
      const { data } = await api.post<MfaSetupResponse>("/auth/mfa/setup", {
        password: password.trim(),
      });
      setSetup(data);
      setCode("");
      setMessage(
        data.mfaEnabled
          ? "New secret generated. Scan to rotate your MFA authenticator."
          : "Scan the QR code in your authenticator app, then enter the 6-digit code.",
      );
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to start MFA setup.";
      setError(text);
    } finally {
      setLoadingSetup(false);
      await loadStatus();
    }
  };

  const enableMfa = async () => {
    resetFeedback();
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter a valid 6-digit authenticator code.");
      return;
    }

    setLoadingEnable(true);
    try {
      const { data } = await api.post<RecoveryCodesResponse>("/auth/mfa/enable", {
        code: code.trim(),
      });
      setRecoveryCodes(data.recoveryCodes || []);
      setMessage("MFA enabled successfully. Future logins can require your authenticator app.");
      setCode("");
      setSetup(null);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to enable MFA.";
      setError(text);
    } finally {
      setLoadingEnable(false);
      await loadStatus();
    }
  };

  const disableMfa = async () => {
    resetFeedback();
    if (!canRunSensitiveAction) {
      setError("Enter your current password to disable MFA.");
      return;
    }

    if (!confirm("Disable MFA on this account? This reduces security.")) return;

    setLoadingDisable(true);
    try {
      await api.post("/auth/mfa/disable", { password: password.trim() });
      setSetup(null);
      setCode("");
      setRecoveryCodes([]);
      setMessage("MFA disabled. You can re-enable it any time.");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to disable MFA.";
      setError(text);
    } finally {
      setLoadingDisable(false);
      await loadStatus();
    }
  };

  const regenerateRecoveryCodes = async () => {
    resetFeedback();
    if (!canRunSensitiveAction) {
      setError("Enter your current password to regenerate recovery codes.");
      return;
    }

    setLoadingRegenCodes(true);
    try {
      const { data } = await api.post<RecoveryCodesResponse>(
        "/auth/mfa/recovery-codes/regenerate",
        {
          password: password.trim(),
        },
      );
      setRecoveryCodes(data.recoveryCodes || []);
      setMessage("New recovery codes generated. Save them now; they are shown only once.");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to regenerate recovery codes.";
      setError(text);
    } finally {
      setLoadingRegenCodes(false);
      await loadStatus();
    }
  };

  const copyRecoveryCodes = async () => {
    if (recoveryCodes.length === 0) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setMessage("Recovery codes copied to clipboard.");
  };

  const downloadRecoveryCodes = () => {
    if (recoveryCodes.length === 0) return;
    const payload = recoveryCodes.join("\n");
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloudvm-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cyber-card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-cyber-text mb-1">{title}</h2>
        <p className="text-cyber-text-dim text-sm">{description}</p>
      </div>

      <div className="rounded-xl border border-cyber-border p-4">
        <h3 className="text-sm font-semibold text-cyber-text mb-3">Current MFA status</h3>
        {loadingStatus ? (
          <p className="text-cyber-text-dim text-sm">Loading status...</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-cyber-text-dim mb-1">MFA state</div>
              <div className={status?.mfaEnabled ? "text-cyber-green" : "text-cyber-red"}>
                {status?.mfaEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <div className="text-cyber-text-dim mb-1">Enabled at</div>
              <div className="text-cyber-text">
                {status?.mfaEnabledAt ? new Date(status.mfaEnabledAt).toLocaleString() : "-"}
              </div>
            </div>
            <div>
              <div className="text-cyber-text-dim mb-1">Recovery codes remaining</div>
              <div className="text-cyber-text">{status?.recoveryCodesRemaining ?? "-"}</div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-cyber-text-dim mb-2">
          Re-authentication password (required for setup/rotate/disable/regenerate)
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter current password"
          className="cyber-input max-w-md"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={startSetup}
          disabled={loadingSetup || !canRunSensitiveAction}
          className="cyber-btn-primary disabled:opacity-60"
        >
          {loadingSetup ? "Generating..." : setup ? "Rotate Secret" : "Set Up MFA"}
        </button>

        <button
          onClick={disableMfa}
          disabled={loadingDisable || !canRunSensitiveAction}
          className="cyber-btn-secondary disabled:opacity-60"
        >
          {loadingDisable ? "Disabling..." : "Disable MFA"}
        </button>

        <button
          onClick={regenerateRecoveryCodes}
          disabled={loadingRegenCodes || !canRunSensitiveAction || !status?.mfaEnabled}
          className="cyber-btn-secondary disabled:opacity-60"
        >
          {loadingRegenCodes ? "Regenerating..." : "Regenerate Recovery Codes"}
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 px-3 py-2 text-sm text-cyber-green">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
          {error}
        </div>
      )}

      {setup && (
        <div className="grid lg:grid-cols-[240px,1fr] gap-6 items-start">
          <div className="rounded-xl border border-cyber-border bg-cyber-bg p-3 flex items-center justify-center">
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                alt="TOTP QR code"
                width={220}
                height={220}
                className="w-[220px] h-[220px] rounded"
              />
            ) : (
              <div className="w-[220px] h-[220px] rounded border border-cyber-border/60 bg-cyber-bg-dim/30 flex items-center justify-center text-cyber-text-dim text-xs text-center px-3">
                {hasSetupSession
                  ? "Generating QR..."
                  : "QR unavailable. Use manual secret below."}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-cyber-text-dim mb-1">
                Account
              </div>
              <div className="text-sm text-cyber-text">{setup.accountName}</div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-cyber-text-dim mb-1">
                Manual secret (if QR scan fails)
              </div>
              <code className="block rounded bg-cyber-bg border border-cyber-border px-3 py-2 text-cyber-cyan text-sm break-all">
                {setup.secret}
              </code>
            </div>

            <div>
              <label className="block text-sm text-cyber-text-dim mb-2">
                Enter 6-digit code from authenticator
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="cyber-input w-40"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <button
                  onClick={enableMfa}
                  disabled={loadingEnable}
                  className="cyber-btn-primary disabled:opacity-60"
                >
                  {loadingEnable ? "Enabling..." : "Enable MFA"}
                </button>
              </div>
            </div>

            <p className="text-xs text-cyber-text-dim">
              Setup session expires in about {Math.ceil(setup.setupExpiresInSeconds / 60)} minute(s).
            </p>
          </div>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="rounded-xl border border-cyber-orange/30 bg-cyber-orange/10 p-4 space-y-3">
          <div className="text-sm text-cyber-orange font-semibold">
            Recovery codes (shown once)
          </div>
          <p className="text-xs text-cyber-text-dim">
            Save these now. Each code can be used once if your authenticator is unavailable.
          </p>
          <code className="block rounded bg-cyber-bg border border-cyber-border px-3 py-2 text-cyber-text text-sm whitespace-pre-wrap break-all">
            {recoveryCodes.join("\n")}
          </code>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyRecoveryCodes} className="cyber-btn-secondary">
              Copy codes
            </button>
            <button onClick={downloadRecoveryCodes} className="cyber-btn-secondary">
              Download .txt
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-cyber-border p-4">
        <h3 className="text-sm font-semibold text-cyber-text mb-3">Recent MFA audit trail</h3>
        {audit.length === 0 ? (
          <p className="text-xs text-cyber-text-dim">No MFA audit events yet.</p>
        ) : (
          <div className="space-y-2">
            {audit.slice(0, 8).map((item, idx) => (
              <div
                key={`${item.action}-${item.createdAt}-${idx}`}
                className="text-xs text-cyber-text-dim flex flex-wrap gap-x-3 gap-y-1"
              >
                <span className="text-cyber-text">{item.action}</span>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
                <span>IP: {item.ip}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
