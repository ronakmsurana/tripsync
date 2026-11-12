// Generates docs/diagrams/er-diagram.{dot,svg,png} from the LIVE PostgreSQL schema.
//   node scripts/gen-er-diagram.mjs      (needs Graphviz `dot` on PATH)
import "dotenv/config";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const cols = (await db.query(`
  SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length AS len, c.numeric_precision AS prec, c.numeric_scale AS scale,
         c.is_nullable, c.udt_name
  FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
  WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name NOT LIKE '\\_prisma%' ORDER BY c.table_name, c.ordinal_position`)).rows;
const pks = (await db.query(`
  SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
  WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`)).rows;
const fks = (await db.query(`
  SELECT con.conname, cl.relname AS child, cf.relname AS parent,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS child_cols,
         con.confdeltype AS on_delete
  FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class cf ON cf.oid = con.confrelid
  WHERE con.contype='f' AND cl.relnamespace = 'public'::regnamespace ORDER BY 1`)).rows;
await db.end();

const pk = new Set(pks.map((r) => `${r.table_name}.${r.column_name}`));
const fk = new Set(fks.flatMap((f) => f.child_cols.map((c) => `${f.child}.${c}`)));
const type = (c) => {
  if (c.udt_name === "vector") return "vector(384)";
  if (c.udt_name === "tsvector") return "tsvector";
  if (c.data_type === "character varying") return `varchar(${c.len})`;
  if (c.data_type === "character") return `char(${c.len})`;
  if (c.data_type === "numeric") return `numeric(${c.prec},${c.scale})`;
  if (c.data_type === "timestamp without time zone") return "timestamp";
  if (c.data_type === "integer") return "int";
  return c.data_type;
};
const tables = [...new Set(cols.map((c) => c.table_name))];
let dot = `digraph ER {\n  graph [rankdir=LR, splines=true, nodesep=0.35, ranksep=1.1, fontname="Helvetica", labelloc=t, label="TripSync — PostgreSQL entity-relationship diagram (generated from the live schema)", fontsize=18, pad=0.3];\n  node [shape=plain, fontname="Helvetica", fontsize=10];\n  edge [fontname="Helvetica", fontsize=8, color="#475569"];\n`;
for (const t of tables) {
  const rows = cols.filter((c) => c.table_name === t).map((c) => {
    const key = pk.has(`${t}.${c.column_name}`) ? "PK" : "";
    const f = fk.has(`${t}.${c.column_name}`) ? "FK" : "";
    const tag = [key, f].filter(Boolean).join(",");
    const nn = c.is_nullable === "NO" ? "" : " ?";
    return `<TR><TD ALIGN="LEFT" PORT="${c.column_name}"><B>${c.column_name}</B>${nn}</TD><TD ALIGN="LEFT"><FONT COLOR="#475569">${type(c)}</FONT></TD><TD ALIGN="LEFT">${tag ? `<FONT COLOR="#b45309"><B>${tag}</B></FONT>` : " "}</TD></TR>`;
  });
  dot += `  ${t} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#0f172a"><TR><TD COLSPAN="3" BGCOLOR="#0f172a"><FONT COLOR="white"><B>${t}</B></FONT></TD></TR>${rows.join("")}</TABLE>>];\n`;
}
for (const f of fks) {
  const label = f.child_cols.join(", ");
  const cascade = f.on_delete === "c" ? " (cascade)" : f.on_delete === "n" ? " (set null)" : "";
  dot += `  ${f.child} -> ${f.parent} [arrowhead=tee, arrowtail=crow, dir=both, label="${label}${cascade}"];\n`;
}
dot += "}\n";
fs.writeFileSync("docs/diagrams/er-diagram.dot", dot);
execFileSync("dot", ["-Tsvg", "docs/diagrams/er-diagram.dot", "-o", "docs/diagrams/er-diagram.svg"]);
execFileSync("dot", ["-Tpng", "-Gdpi=130", "docs/diagrams/er-diagram.dot", "-o", "docs/diagrams/er-diagram.png"]);
console.log(`✓ ER diagram: ${tables.length} tables, ${fks.length} foreign keys`);
