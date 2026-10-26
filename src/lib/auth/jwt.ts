// ============================================
// JWT Authentication Utilities
// ============================================
// Sign and verify JWTs using the 'jose' library
// (Edge-runtime compatible, no Node.js crypto)
// ============================================

import { SignJWT, jwtVerify, JWTPayload } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-do-not-use-in-production"
);

export interface TokenPayload extends JWTPayload {
  userId: number;
  email: string;
  name: string;
}

/**
 * Sign a JWT with the given payload.
 * Default expiration: 7 days.
 */
export async function signToken(payload: {
  userId: number;
  email: string;
  name: string;
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "7d")
    .sign(secret);
}

/**
 * Verify and decode a JWT.
 * Returns the payload if valid, or null if expired/invalid.
 */
export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}
