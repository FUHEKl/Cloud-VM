import { createHmac, randomBytes, randomInt } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) {
    output += "=";
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32 character");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateMfaCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function buildOtpAuthUrl(secret: string, label: string, issuer: string): string {
  const encodedLabel = encodeURIComponent(label);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secret: string, forUnixTime: number = Date.now()): string {
  const secretKey = base32Decode(secret);
  const timestep = Math.floor(forUnixTime / 1000 / 30);

  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(timestep / 0x100000000), 0);
  counter.writeUInt32BE(timestep >>> 0, 4);

  const hmac = createHmac("sha1", secretKey).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotpCode(secret: string, code: string, window: number = 1): boolean {
  const normalizedCode = (code || "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const now = Date.now();
  for (let offset = -window; offset <= window; offset++) {
    const candidate = generateTotpCode(secret, now + offset * 30_000);
    if (candidate === normalizedCode) {
      return true;
    }
  }

  return false;
}
