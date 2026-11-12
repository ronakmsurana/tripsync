// POST /api/auth/logout — clears the session cookie
import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const res = NextResponse.json({ success: true, message: "Signed out" });
  endSession(res, request);
  return res;
}
