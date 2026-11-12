// Generates docs/04-data-dictionary.md from the LIVE PostgreSQL catalog (columns, keys, constraints, triggers, views, functions).
//   node scripts/gen-data-dictionary.mjs
import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql) => (await db.query(sql)).rows;

const tables = await q(`SELECT c.relname AS name, obj_description(c.oid) AS comment FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname NOT LIKE '\\_prisma%' ORDER BY 1`);
let md = `# Data Dictionary (generated from the live PostgreSQL schema)\n\n> Regenerate with \`node scripts/gen-data-dictionary.mjs\`. Do not edit by hand.\n\n`;
for (const t of tables) {
  md += `## \`${t.name}\`\n\n`;
  const cols = await q(`
    SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
           pg_get_expr(d.adbin, d.adrelid) AS def, a.attgenerated <> '' AS generated
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.${t.name}'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
  const keys = await q(`
    SELECT con.contype AS kind, con.conname AS name, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con WHERE con.conrelid='public.${t.name}'::regclass ORDER BY con.contype, con.conname`);
  const pkCols = new Set(); const fkCols = new Set();
  for (const k of keys) {
    const m = /\(([^)]+)\)/.exec(k.def);
    if (!m) continue;
    const list = m[1].split(",").map((s) => s.trim());
    if (k.kind === "p") list.forEach((c) => pkCols.add(c));
    if (k.kind === "f") list.forEach((c) => fkCols.add(c));
  }
  md += `| Column | Type | Null | Default | Key |\n|---|---|---|---|---|\n`;
  for (const c of cols) {
    const key = [pkCols.has(c.col) ? "PK" : "", fkCols.has(c.col) ? "FK" : ""].filter(Boolean).join(", ");
    md += `| \`${c.col}\` | \`${c.type}\` | ${c.nullable ? "yes" : "no"} | ${c.generated ? "*generated*" : c.def ? "`" + c.def.replace(/\|/g, "\\|") + "`" : ""} | ${key} |\n`;
  }
  const rel = keys.filter((k) => ["u", "f", "c"].includes(k.kind));
  if (rel.length) {
    md += `\n**Constraints**\n\n| Kind | Name | Definition |\n|---|---|---|\n`;
    const kindName = { u: "UNIQUE", f: "FOREIGN KEY", c: "CHECK" };
    for (const k of rel) md += `| ${kindName[k.kind]} | \`${k.name}\` | \`${k.def.replace(/\|/g, "\\|")}\` |\n`;
  }
  const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${t.name}' AND indexname NOT LIKE '%\\_pkey' ORDER BY 1`);
  if (idx.length) { md += `\n**Indexes**\n\n`; for (const i of idx) md += `- \`${i.indexdef.replace("public.", "")}\`\n`; }
  const trg = await q(`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid='public.${t.name}'::regclass AND NOT tgisinternal ORDER BY 1`);
  if (trg.length) { md += `\n**Triggers**\n\n`; for (const g of trg) md += `- \`${g.tgname}\` — ${g.def.replace(/^CREATE (CONSTRAINT )?TRIGGER \S+ /, "").replace("public.", "")}\n`; }
  md += "\n";
}
const views = await q(`SELECT viewname FROM pg_views WHERE schemaname='public' ORDER BY 1`);
md += `## Views\n\n` + views.map((v) => `- \`${v.viewname}\``).join("\n") + "\n\n";
const fns = await q(`SELECT p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname LIKE 'fn\\_%' ORDER BY 1`);
md += `## Functions\n\n| Function | Arguments | Returns |\n|---|---|---|\n` + fns.map((f) => `| \`${f.proname}\` | \`${f.args}\` | \`${f.result.replace(/\n/g, " ")}\` |`).join("\n") + "\n";
fs.writeFileSync("docs/04-data-dictionary.md", md);
await db.end();
console.log(`✓ data dictionary: ${tables.length} tables, ${views.length} views, ${fns.length} functions`);
