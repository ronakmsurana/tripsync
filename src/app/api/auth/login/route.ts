// POST /api/auth/login
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db/postgres";
import { loginSchema } from "@/lib/utils/validation";
import { startSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/security/rateLimit";

// Compared against when the email is unknown so response time does not reveal which emails exist.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("tripsync-dummy-password", 12));

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json().catch(() => ({})));
    const key = `login:${clientIp(request)}:${body.email}`;
    rateLimit(key, 10, 15 * 60 * 1000);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { userId: true, name: true, email: true, role: true, status: true, passwordHash: true },
    });
    const valid = await bcrypt.compare(body.password, user?.passwordHash ?? getDummyHash());
    if (!user || !valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    if (user.status !== "active") throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");

    resetRateLimit(key);
    const res = NextResponse.json({
      success: true,
      data: { user: { userId: user.userId, name: user.name, email: user.email, role: user.role } },
      message: "Signed in",
    });
    await startSession(res, user.userId, request);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
