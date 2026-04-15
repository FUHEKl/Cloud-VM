const DEFAULT_SECRET_MARKERS = [
  "super-secret-key",
  "super-secret-jwt-key-change-in-production",
  "super-secret-refresh-key-change-in-production",
  "change-in-production",
];

function isWeakSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return DEFAULT_SECRET_MARKERS.some((marker) => lowered.includes(marker));
}

export function validateJwtSecretsOrThrow() {
  const jwtSecret = process.env.JWT_SECRET || "";
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";

  // SECURITY: fail fast if JWT secrets are weak/default to prevent insecure startup.
  if (jwtSecret.length < 64 || isWeakSecret(jwtSecret)) {
    throw new Error(
      "JWT_SECRET is weak. Use at least 64 chars and never default placeholders.",
    );
  }

  // SECURITY: fail fast if refresh secret is weak/default to prevent token theft impact.
  if (jwtRefreshSecret.length < 64 || isWeakSecret(jwtRefreshSecret)) {
    throw new Error(
      "JWT_REFRESH_SECRET is weak. Use at least 64 chars and never default placeholders.",
    );
  }

  // SECURITY: Prevents accidental deployment with weak or default secrets.
  console.log("SECURITY: JWT secret validation passed");
}
