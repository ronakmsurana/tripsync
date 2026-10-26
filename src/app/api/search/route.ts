// ============================================
// Semantic Search API
// POST /api/search — Vector similarity search
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { searchSchema } from "@/lib/utils/validation";
import { semanticSearch } from "@/lib/services/embeddingService";
import { TokenPayload } from "@/lib/auth/jwt";

export const POST = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, _user: TokenPayload) => {
    try {
      const body = await request.json();
      const parsed = searchSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { query, tripId, limit } = parsed.data;

      const results = await semanticSearch(query, tripId, limit);

      return NextResponse.json({
        success: true,
        data: {
          query,
          results,
          count: results.length,
        },
      });
    } catch (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
