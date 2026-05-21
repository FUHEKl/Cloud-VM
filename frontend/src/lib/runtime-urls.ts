const normalizeApiOrigin = (value: string) =>
  value.endsWith("/api") ? value.slice(0, -4) : value;

function inferGatewayOriginFromWindow(): string {
  if (typeof window === "undefined") {
    return "https://127.0.0.1";
  }

  const { origin } = window.location;

  // When served behind reverse proxy (nginx), same origin should expose /api + WS paths.
  return origin;
}

export function resolveApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return normalizeApiOrigin(configured);
  }

  return inferGatewayOriginFromWindow();
}

export function resolveVmWsOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_VM_WS_URL;
  if (configured) {
    return normalizeApiOrigin(configured);
  }

  return resolveApiOrigin();
}
