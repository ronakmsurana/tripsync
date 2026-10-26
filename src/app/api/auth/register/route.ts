// ============================================
// Auth API — Register
// POST /api/auth/register
// ============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db/postgres";
import { signToken } from "@/lib/auth/jwt";
import { registerSchema } from "@/lib/utils/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, phone } = parsed.data;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password (never store plaintext — security requirement)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user within a transaction
    const user = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          phone,
        },
        select: {
          userId: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
        },
      });
    });

    // Generate JWT
    const token = await signToken({
      userId: user.userId,
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json(
      {
        success: true,
        data: { user, token },
        message: "Account created successfully",
      },
      { status: 201 }
    );

    // Also set as httpOnly cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
