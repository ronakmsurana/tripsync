// npm run verify:embeddings
// Loads the real sentence-transformer and checks that semantically related texts score higher than
// unrelated ones. Needs network access to the Hugging Face hub the first time (weights are cached).
import "dotenv/config";
import { embedText } from "../src/lib/services/embeddingService";

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0); // vectors are L2-normalised

async function main() {
  const q = await embedText("peaceful sunrise walk at an ancient shrine");
  const related = await embedText("Sunrise at Matanga Hill. Climb the hill for a golden dawn over the temple ruins");
  const unrelated = await embedText("Lunch at a pizza restaurant. Cheese pizza and soft drinks");
  const sRel = dot(q, related), sUnrel = dot(q, unrelated);
  console.log(`dimensions: ${q.length}\nrelated    cosine: ${sRel.toFixed(3)}\nunrelated  cosine: ${sUnrel.toFixed(3)}`);
  if (q.length !== 384 || !(sRel > sUnrel)) { console.error("✗ Embedding sanity check FAILED"); process.exitCode = 1; }
  else console.log("✓ Embedding model works and ranks related text higher");
}
main().catch((e) => { console.error("✗ Embedding model unavailable:", e.message); process.exitCode = 1; });
