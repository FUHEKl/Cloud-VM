import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.VM_SSH_KEY_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing VM_SSH_KEY_SECRET");
  }

  const salt = Buffer.from("cloudvm-vm-ssh-key-salt", "utf8");
  const info = Buffer.from("cloudvm-vm-ssh-key-encryption", "utf8");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, info, 32));
}

export function encryptVmPrivateKey(plainTextPem: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plainTextPem, "utf8")),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptVmPrivateKey(cipherPayload: string): string {
  const [ivB64, tagB64, encryptedB64] = cipherPayload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted VM private key payload format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
