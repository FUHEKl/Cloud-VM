"use client";

import MfaSettingsPanel from "@/components/auth/MfaSettingsPanel";

export default function AdminMfaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-cyber-text mb-2">Admin MFA</h1>
      <p className="text-cyber-text-dim text-sm mb-6 max-w-3xl">
        Security controls for administrative accounts. Configure app-based TOTP and manage recovery access.
      </p>

      <MfaSettingsPanel
        title="Administrator MFA"
        description="Use authenticator MFA and recovery codes to protect privileged access."
      />
    </div>
  );
}
