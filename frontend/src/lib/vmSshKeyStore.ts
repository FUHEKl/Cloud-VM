const VM_SSH_KEY_STORAGE = "cloudvm.vmSshPrivateKeys";

type VmSshKeyMap = Record<string, string>;

function readMap(): VmSshKeyMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(VM_SSH_KEY_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VmSshKeyMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: VmSshKeyMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VM_SSH_KEY_STORAGE, JSON.stringify(map));
}

export function saveGeneratedVmSshPrivateKey(vmId: string, privateKey: string): void {
  if (!vmId || !privateKey) return;
  const map = readMap();
  map[vmId] = privateKey;
  writeMap(map);
}

export function getGeneratedVmSshPrivateKey(vmId: string): string | null {
  if (!vmId) return null;
  const map = readMap();
  const key = map[vmId];
  return typeof key === "string" && key.length > 0 ? key : null;
}
