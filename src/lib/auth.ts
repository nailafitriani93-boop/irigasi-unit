
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "ggf-session";

const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type AuthSession = {
  userId: string;
  username: string;
  name: string;
  roleId: string;
  expiresAt: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET belum diatur atau panjangnya kurang dari 32 karakter."
    );
  }

  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password minimal harus 8 karakter.");
  }

  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!storedHash) return false;

  const parts = storedHash.split(":");

  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[a-f0-9]{32}$/i.test(parts[1]) ||
    !/^[a-f0-9]{128}$/i.test(parts[2])
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(parts[2], "hex");
    const actual = (await scrypt(password, parts[1], 64)) as Buffer;

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function createSessionToken(
  session: Omit<AuthSession, "expiresAt">
): string {
  const payload: AuthSession = {
    ...session,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token: string | undefined
): AuthSession | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;

  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);

  try {
    const expectedSignature = Buffer.from(sign(encoded));
    const actualSignature = Buffer.from(suppliedSignature);

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const session = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as AuthSession;

    if (
      !session.userId ||
      !session.username ||
      !session.expiresAt ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}
