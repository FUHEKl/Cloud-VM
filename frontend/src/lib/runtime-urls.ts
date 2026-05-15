const normalizeApiOrigin = (value: string) =>
  value.endsWith("/api") ? value.slice(0, -4) : value;

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function inferGatewayOriginFromWindow(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3001";
  }

  const { protocol, hostname, port, origin } = window.location;

  // Local dev: frontend runs on :3000 while gateway runs on :3001.
  if (isLocalDevHost(hostname) && port === "3000") {
    return `${protocol}//${hostname}:3001`;
  }

  // When served behind reverse proxy (nginx), same origin should expose /api + WS paths.
  return origin;
}

export function resolveApiOrigin(): string {
  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname) && window.location.port === "3000") {
    return inferGatewayOriginFromWindow();
  }

  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return normalizeApiOrigin(configured);
  }

  return inferGatewayOriginFromWindow();
}

export function resolveVmWsOrigin(): string {
  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname) && window.location.port === "3000") {
    return inferGatewayOriginFromWindow();
  }

  const configured = process.env.NEXT_PUBLIC_VM_WS_URL;
  if (configured) {
    return normalizeApiOrigin(configured);
  }

  return resolveApiOrigin();
}
