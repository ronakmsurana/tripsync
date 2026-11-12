// Consistent success envelope: { success: true, data, message? }
import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: { status?: number; message?: string }): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(init?.message ? { message: init.message } : {}) },
    { status: init?.status ?? 200 }
  );
}

export function created<T>(data: T, message?: string): NextResponse {
  return ok(data, { status: 201, message });
}
