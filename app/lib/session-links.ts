import { PublicKey } from "@solana/web3.js";

const JOIN_CODE_PATTERN = /^[A-Z0-9]{4,10}$/;
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SessionLookup = {
  joinCode?: string;
  sessionAddress?: string;
};

function toSessionAddress(value: string): string | null {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

export function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

export function isValidJoinCode(value: string): boolean {
  return JOIN_CODE_PATTERN.test(normalizeJoinCode(value));
}

export function generateJoinCode(length = 6): string {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * JOIN_CODE_ALPHABET.length);
    return JOIN_CODE_ALPHABET[index];
  }).join("");
}

export function buildJoinUrl(origin: string, joinCode: string): string {
  const url = new URL("/join", origin);
  url.searchParams.set("code", normalizeJoinCode(joinCode));
  return url.toString();
}

export function extractSessionLookup(input: string): SessionLookup | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const code = normalizeJoinCode(url.searchParams.get("code") ?? "");
    if (JOIN_CODE_PATTERN.test(code)) {
      return { joinCode: code };
    }

    const sessionAddress = toSessionAddress(url.searchParams.get("session")?.trim() ?? "");
    return sessionAddress ? { sessionAddress } : null;
  } catch {
    const normalizedCode = normalizeJoinCode(trimmed);
    if (JOIN_CODE_PATTERN.test(normalizedCode)) {
      return { joinCode: normalizedCode };
    }

    const sessionAddress = toSessionAddress(trimmed);
    return sessionAddress ? { sessionAddress } : null;
  }
}
