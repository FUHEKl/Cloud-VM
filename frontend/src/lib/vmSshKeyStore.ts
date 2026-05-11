const generatedVmSshKeys = new Map<string, string>();
const userGeneratedSshKeys = new Map<string, string>();
const userGeneratedSshKeyFilenames = new Map<string, string>();
const userGeneratedSshKeyDownloaded = new Map<string, boolean>();

function canUseBrowserApis() {
  return typeof window !== "undefined";
}

export function saveGeneratedVmSshPrivateKey(vmId: string, privateKey: string): void {
  if (!vmId || !privateKey) return;
  generatedVmSshKeys.set(vmId, privateKey);
}

export function getGeneratedVmSshPrivateKey(vmId: string): string | null {
  if (!vmId) return null;
  const key = generatedVmSshKeys.get(vmId);
  return key && key.length > 0 ? key : null;
}

export function saveUserGeneratedSshPrivateKey(
  sshKeyId: string,
  privateKey: string,
  filename?: string,
): void {
  if (!sshKeyId || !privateKey) return;
  userGeneratedSshKeys.set(sshKeyId, privateKey);

  if (filename) {
    userGeneratedSshKeyFilenames.set(sshKeyId, filename);
  }
}

export function getUserGeneratedSshPrivateKey(sshKeyId: string): string | null {
  if (!sshKeyId) return null;
  const key = userGeneratedSshKeys.get(sshKeyId);
  return key && key.length > 0 ? key : null;
}

export function getUserGeneratedSshPrivateKeyFilename(sshKeyId: string): string | null {
  if (!sshKeyId) return null;
  const filename = userGeneratedSshKeyFilenames.get(sshKeyId);
  return filename && filename.length > 0 ? filename : null;
}

export function hasDownloadedGeneratedSshPrivateKey(sshKeyId: string): boolean {
  if (!sshKeyId) return false;
  return userGeneratedSshKeyDownloaded.get(sshKeyId) === true;
}

export function markGeneratedSshPrivateKeyDownloaded(sshKeyId: string): void {
  if (!sshKeyId) return;
  userGeneratedSshKeyDownloaded.set(sshKeyId, true);
}

export function downloadPrivateKeyAsPem(filename: string, privateKey: string): void {
  if (!filename || !privateKey || !canUseBrowserApis()) return;

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

export function clearCachedSshPrivateKeys(): void {
  generatedVmSshKeys.clear();
  userGeneratedSshKeys.clear();
  userGeneratedSshKeyFilenames.clear();
  userGeneratedSshKeyDownloaded.clear();
}
