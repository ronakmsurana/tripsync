// ============================================
// Embedding provider (local sentence-transformer)
// ============================================
// Model:   Xenova/all-MiniLM-L6-v2 (384 dimensions) run locally through
//          @xenova/transformers (ONNX). No API key and no external service
//          at query time; the weights (~25 MB) are downloaded once from the
//          Hugging Face hub on first use and cached on disk.
// Failure: if the model cannot be loaded (offline, blocked network, disabled)
//          an EmbeddingUnavailableError is thrown. Callers fall back to
//          PostgreSQL full-text search and SAY SO — nothing is faked.
// ============================================
import { env } from "@/lib/env";

export const EMBEDDING_DIM = 384;

export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

type Extractor = (text: string, opts: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array }>;

const g = globalThis as unknown as {
  __embedder?: Promise<Extractor>;
  __embedderFailedAt?: number;
  __embedderError?: string;
};
const RETRY_AFTER_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function loadExtractor(): Promise<Extractor> {
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", env().EMBEDDING_MODEL);
  return extractor as unknown as Extractor;
}

export function embeddingStatus(): { enabled: boolean; model: string; lastError?: string } {
  const e = env();
  return { enabled: e.EMBEDDING_ENABLED, model: e.EMBEDDING_MODEL, lastError: g.__embedderError };
}

async function getExtractor(): Promise<Extractor> {
  const cfg = env();
  if (!cfg.EMBEDDING_ENABLED) throw new EmbeddingUnavailableError("Semantic search is disabled (EMBEDDING_ENABLED=false).");
  if (g.__embedderFailedAt && Date.now() - g.__embedderFailedAt < RETRY_AFTER_MS) {
    throw new EmbeddingUnavailableError(`Embedding model unavailable: ${g.__embedderError}`);
  }
  if (!g.__embedder) {
    g.__embedder = withTimeout(loadExtractor(), cfg.EMBEDDING_TIMEOUT_MS, "Loading the embedding model").catch((err) => {
      g.__embedder = undefined;
      g.__embedderFailedAt = Date.now();
      g.__embedderError = err instanceof Error ? err.message : String(err);
      throw new EmbeddingUnavailableError(`Embedding model unavailable: ${g.__embedderError}`);
    });
  }
  return g.__embedder;
}

/** L2-normalised 384-d vector. Throws EmbeddingUnavailableError if the model cannot run. */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
  const v = Array.from(out.data);
  if (v.length !== EMBEDDING_DIM) throw new EmbeddingUnavailableError(`Unexpected embedding size ${v.length}`);
  return v;
}

/** pgvector text literal: "[0.1,0.2,...]" */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
