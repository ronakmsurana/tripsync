// GET /api/dashboard — user-specific statistics
import { route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { getDashboard } from "@/lib/services/dashboardService";

export const GET = route({}, async ({ user }) => ok(await getDashboard(user.userId)));
