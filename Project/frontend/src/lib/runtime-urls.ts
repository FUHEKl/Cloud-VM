const normalizeApiOrigin = (value: string) =>
  value.endsWith("/api") ? value.slice(0, -4) : value;

function inferGatewayOriginFromWindow(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  const { protocol, hostname, port, origin } = window.location;

  // Local dev: frontend runs on :3000 while gateway runs on :3001.
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
    return `${protocol}//${hostname}:3001`;
  }

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
