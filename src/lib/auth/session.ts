// ============================================
// Session handling (httpOnly cookie)
// ============================================
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { signToken, verifyToken } from "./jwt";

export const SESSION_COOKIE = "tripsync_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
  userId: number;
  name: string;
  email: string;
  role: "user" | "admin";
}

/** True when the browser reached us over HTTPS (directly or via a TLS-terminating proxy). */
export function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function startSession(response: NextResponse, userId: number, request: NextRequest): Promise<void> {
  response.cookies.set(SESSION_COOKIE, await signToken(userId), {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export function endSession(response: NextResponse, request: NextRequest): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/** Resolves the logged-in user from the cookie; null if absent/invalid/suspended. */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifyToken(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { userId: true, name: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== "active") return null;
  return { userId: user.userId, name: user.name, email: user.email, role: user.role as "user" | "admin" };
}
