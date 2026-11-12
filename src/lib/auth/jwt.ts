// ============================================
// JWT utilities (jose, HS256)
// ============================================
// The token only carries the user id (`sub`). Role, status and name are always
// read from the database, so suspending a user or changing a role takes
// effect immediately and a stale token can never grant extra privileges.
// ============================================
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

function key() {
  return new TextEncoder().encode(env().JWT_SECRET);
}

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(env().JWT_EXPIRES_IN)
    .sign(key());
}

/** Returns the user id, or null when the token is missing, tampered with or expired. */
export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
