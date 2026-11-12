// POST /api/auth/register — create account (bcrypt-hashed password, httpOnly session cookie)
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db/postgres";
import { registerSchema } from "@/lib/utils/validation";
import { startSession } from "@/lib/auth/session";
import { errorResponse, conflict } from "@/lib/api/errors";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";

const BCRYPT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  try {
    rateLimit(`register:${clientIp(request)}`, 20, 60 * 60 * 1000);
    const body = registerSchema.parse(await request.json().catch(() => ({})));
    const exists = await prisma.user.findUnique({ where: { email: body.email }, select: { userId: true } });
    if (exists) throw conflict("An account with this email already exists.", undefined, "EMAIL_TAKEN");

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, phone: body.phone },
      select: { userId: true, name: true, email: true, role: true },
    });
    const res = NextResponse.json({ success: true, data: { user }, message: "Account created" }, { status: 201 });
    await startSession(res, user.userId, request);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
