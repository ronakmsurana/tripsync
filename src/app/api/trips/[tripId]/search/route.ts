// POST /api/trips/[tripId]/search — semantic (pgvector) with honest full-text fallback
import { ANY_ROLE, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { searchSchema } from "@/lib/utils/validation";
import { keywordSearch, semanticSearch } from "@/lib/services/searchIndexService";
import { EmbeddingUnavailableError } from "@/lib/services/embeddingService";
import { SearchResponse } from "@/types";

export const POST = route({ trip: ANY_ROLE }, async (ctx) => {
  const { query, mode, limit } = await ctx.body(searchSchema.omit({ tripId: true }));
  let result: SearchResponse;

  if (mode !== "keyword") {
    try {
      const sem = await semanticSearch(ctx.tripId, query, limit);
      if (sem.hits.length > 0 || mode === "semantic") {
        result = {
          query, modeUsed: "semantic", results: sem.hits,
          notice: sem.notIndexed > 0 ? `${sem.notIndexed} activit${sem.notIndexed === 1 ? "y is" : "ies are"} not indexed for semantic search yet.` : undefined,
        };
        return ok(result);
      }
      // Nothing is indexed yet: use keyword search and say so.
      const kw = await keywordSearch(ctx.tripId, query, limit);
      return ok({ query, modeUsed: "keyword", results: kw.hits, notice: "Activities are not indexed for semantic search yet — showing keyword results." } satisfies SearchResponse);
    } catch (err) {
      if (!(err instanceof EmbeddingUnavailableError)) throw err;
      if (mode === "semantic") throw new ApiError(503, "EMBEDDINGS_UNAVAILABLE", `Semantic search is unavailable: ${err.message}`);
      const kw = await keywordSearch(ctx.tripId, query, limit);
      return ok({ query, modeUsed: "keyword", results: kw.hits, notice: "Semantic search is currently unavailable, so these are keyword (full-text) results." } satisfies SearchResponse);
    }
  }
  const kw = await keywordSearch(ctx.tripId, query, limit);
  return ok({ query, modeUsed: "keyword", results: kw.hits } satisfies SearchResponse);
});
