// GET /api/auth/me — current user (401 if not signed in)
import { route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";

export const GET = route({}, async ({ user }) => ok({ user }));
