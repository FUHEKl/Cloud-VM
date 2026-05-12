const VM_SSH_KEY_STORAGE = "cloudvm.vmSshPrivateKeys";
const USER_GENERATED_SSH_KEY_STORAGE = "cloudvm.userGeneratedSshPrivateKeys";
const USER_GENERATED_SSH_KEY_FILENAME_STORAGE = "cloudvm.userGeneratedSshPrivateKeyFilenames";
const USER_GENERATED_SSH_KEY_DOWNLOADED_STORAGE = "cloudvm.userGeneratedSshPrivateKeysDownloaded";

type StringMap = Record<string, string>;
type BoolMap = Record<string, boolean>;

function canUseStorage() {
  return typeof window !== "undefined";
}

function readStringMap(storageKey: string): StringMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StringMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStringMap(storageKey: string, map: StringMap): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(map));
}

function readBoolMap(storageKey: string): BoolMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BoolMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBoolMap(storageKey: string, map: BoolMap): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(map));
}

export function saveGeneratedVmSshPrivateKey(vmId: string, privateKey: string): void {
  if (!vmId || !privateKey) return;
  const map = readStringMap(VM_SSH_KEY_STORAGE);
  map[vmId] = privateKey;
  writeStringMap(VM_SSH_KEY_STORAGE, map);
}

export function getGeneratedVmSshPrivateKey(vmId: string): string | null {
  if (!vmId) return null;
  const map = readStringMap(VM_SSH_KEY_STORAGE);
  const key = map[vmId];
  return typeof key === "string" && key.length > 0 ? key : null;
}

export function saveUserGeneratedSshPrivateKey(
  sshKeyId: string,
  privateKey: string,
  filename?: string,
): void {
  if (!sshKeyId || !privateKey) return;

  const keyMap = readStringMap(USER_GENERATED_SSH_KEY_STORAGE);
  keyMap[sshKeyId] = privateKey;
  writeStringMap(USER_GENERATED_SSH_KEY_STORAGE, keyMap);

  if (filename) {
    const filenameMap = readStringMap(USER_GENERATED_SSH_KEY_FILENAME_STORAGE);
    filenameMap[sshKeyId] = filename;
    writeStringMap(USER_GENERATED_SSH_KEY_FILENAME_STORAGE, filenameMap);
  }
}

export function getUserGeneratedSshPrivateKey(sshKeyId: string): string | null {
  if (!sshKeyId) return null;
  const map = readStringMap(USER_GENERATED_SSH_KEY_STORAGE);
  const key = map[sshKeyId];
  return typeof key === "string" && key.length > 0 ? key : null;
}

export function getUserGeneratedSshPrivateKeyFilename(sshKeyId: string): string | null {
  if (!sshKeyId) return null;
  const map = readStringMap(USER_GENERATED_SSH_KEY_FILENAME_STORAGE);
  const filename = map[sshKeyId];
  return typeof filename === "string" && filename.length > 0 ? filename : null;
}

export function hasDownloadedGeneratedSshPrivateKey(sshKeyId: string): boolean {
  if (!sshKeyId) return false;
  const map = readBoolMap(USER_GENERATED_SSH_KEY_DOWNLOADED_STORAGE);
  return map[sshKeyId] === true;
}

export function markGeneratedSshPrivateKeyDownloaded(sshKeyId: string): void {
  if (!sshKeyId) return;
  const map = readBoolMap(USER_GENERATED_SSH_KEY_DOWNLOADED_STORAGE);
  map[sshKeyId] = true;
  writeBoolMap(USER_GENERATED_SSH_KEY_DOWNLOADED_STORAGE, map);
}

export function downloadPrivateKeyAsPem(filename: string, privateKey: string): void {
  if (!filename || !privateKey || !canUseStorage()) return;

  const blob = new Blob([privateKey], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
