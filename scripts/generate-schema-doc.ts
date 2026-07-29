// Generates docs/schema.md: a human-readable schema reference built from two
// sources of truth —
//   1. prisma/schema.prisma (model/field/relation/enum structure)
//   2. prisma/migrations/*/migration.sql (the actual DDL Postgres ran)
// plus a Mermaid ER diagram derived from the same parsed structure.
//
// No live DB connection required — everything comes from files already in
// source control, so this works offline and reflects exactly what's committed.
//
// Usage: pnpm docs:schema

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");
const OUT_MD = path.join(ROOT, "docs", "schema.md");
const OUT_MMD = path.join(ROOT, "docs", "schema.mmd");
const OUT_JSON = path.join(ROOT, "docs", "schema.json");

// ---------------------------------------------------------------------------
// Git source-state info — so the generated docs record exactly which commit
// (and whether the working tree was clean) they were built from.
// ---------------------------------------------------------------------------

interface GitInfo {
  commit: string | null;
  dirty: boolean | null;
}

function getGitInfo(): GitInfo {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    // Not a git checkout (or git unavailable) — surface as unknown rather
    // than failing the whole doc generation.
    return { commit: null, dirty: null };
  }
}

const gitInfo = getGitInfo();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldAttr {
  name: string;
  args: string;
}

interface FieldDef {
  name: string;
  rawType: string;
  baseType: string;
  isList: boolean;
  isOptional: boolean;
  attrs: FieldAttr[];
  isRelation: boolean;
}

interface ModelDef {
  name: string;
  description: string;
  fields: FieldDef[];
  blockAttrs: string[];
  pkFields: string[];
  uniqueGroups: string[][];
  indexGroups: string[][];
}

interface EnumDef {
  name: string;
  values: string[];
  description: string;
}

interface RelationEdge {
  fromModel: string;
  fromField: string;
  toModel: string;
  fkColumns: string[];
  refColumns: string[];
  onDelete?: string;
  optional: boolean;
}

interface SqlChunk {
  migration: string;
  sql: string;
}

// ---------------------------------------------------------------------------
// Parse prisma/schema.prisma
// ---------------------------------------------------------------------------

const schemaSrc = fs.readFileSync(SCHEMA_PATH, "utf8");
const lines = schemaSrc.split(/\r?\n/);

function stripLineComment(line: string): string {
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

// Walk upward from `startIdx`, collecting contiguous `//` comment lines
// (tolerating blank-line gaps), stopping at the first real code line.
// Decorative `// ----` separator lines are consumed but not included in the text.
function collectLeadingComment(startIdx: number): string {
  const collected: string[] = [];
  let j = startIdx;
  while (j >= 0) {
    const l = lines[j];
    if (/^\s*$/.test(l)) {
      j--;
      continue;
    }
    if (/^\s*\/\//.test(l)) {
      const text = l.replace(/^\s*\/\/\s?/, "").trim();
      if (text && !/^-+$/.test(text)) collected.unshift(text);
      j--;
      continue;
    }
    break;
  }
  return collected.join(" ");
}

function parseAttrs(rest: string): FieldAttr[] {
  const attrs: FieldAttr[] = [];
  let i = 0;
  while (i < rest.length) {
    if (rest[i] === "@") {
      let j = i + 1;
      while (j < rest.length && /[\w.]/.test(rest[j])) j++;
      const name = rest.slice(i + 1, j);
      let args = "";
      if (rest[j] === "(") {
        let depth = 1;
        let k = j + 1;
        while (k < rest.length && depth > 0) {
          if (rest[k] === "(") depth++;
          else if (rest[k] === ")") depth--;
          k++;
        }
        args = rest.slice(j + 1, k - 1);
        j = k;
      }
      attrs.push({ name, args });
      i = j;
    } else {
      i++;
    }
  }
  return attrs;
}

function parseModel(name: string, bodyLines: string[], description: string): ModelDef {
  const fields: FieldDef[] = [];
  const blockAttrs: string[] = [];

  for (const raw of bodyLines) {
    const line = stripLineComment(raw).trim();
    if (!line) continue;
    if (line.startsWith("@@")) {
      blockAttrs.push(line);
      continue;
    }
    const m = line.match(/^(\w+)\s+(\w+(?:\[\])?\??)\s*(.*)$/);
    if (!m) continue;
    const [, fname, rawType, rest] = m;
    fields.push({
      name: fname,
      rawType,
      baseType: rawType.replace(/\[\]/, "").replace(/\?$/, ""),
      isList: rawType.includes("[]"),
      isOptional: rawType.endsWith("?"),
      attrs: parseAttrs(rest),
      isRelation: false, // resolved once every model name is known
    });
  }

  const pkFields: string[] = [];
  const uniqueGroups: string[][] = [];
  const indexGroups: string[][] = [];

  for (const line of blockAttrs) {
    const idMatch = line.match(/^@@id\(\[([^\]]*)\]/);
    if (idMatch) pkFields.push(...idMatch[1].split(",").map((s) => s.trim()));
    const uMatch = line.match(/^@@unique\(\[([^\]]*)\]/);
    if (uMatch) uniqueGroups.push(uMatch[1].split(",").map((s) => s.trim()));
    const iMatch = line.match(/^@@index\(\[([^\]]*)\]/);
    if (iMatch) indexGroups.push(iMatch[1].split(",").map((s) => s.trim()));
  }
  for (const f of fields) {
    if (f.attrs.some((a) => a.name === "id")) pkFields.push(f.name);
    if (f.attrs.some((a) => a.name === "unique")) uniqueGroups.push([f.name]);
  }

  return { name, description, fields, blockAttrs, pkFields, uniqueGroups, indexGroups };
}

const enums: EnumDef[] = [];
const models: ModelDef[] = [];

for (let i = 0; i < lines.length; i++) {
  const enumMatch = lines[i].match(/^enum\s+(\w+)\s*\{/);
  const modelMatch = lines[i].match(/^model\s+(\w+)\s*\{/);
  if (!enumMatch && !modelMatch) continue;

  const description = collectLeadingComment(i - 1);

  let k = i + 1;
  const body: string[] = [];
  while (k < lines.length && !/^\}\s*$/.test(lines[k])) {
    body.push(lines[k]);
    k++;
  }

  if (enumMatch) {
    const values = body
      .map(stripLineComment)
      .map((l) => l.trim())
      .filter(Boolean);
    enums.push({ name: enumMatch[1], values, description });
  } else if (modelMatch) {
    models.push(parseModel(modelMatch[1], body, description));
  }
  i = k;
}

const modelNames = new Set(models.map((m) => m.name));
for (const model of models) {
  for (const f of model.fields) {
    f.isRelation = modelNames.has(f.baseType);
  }
}

// Owning-side relations only (fields carrying @relation(fields: [...], references: [...])).
// The reverse array/optional field on the other model is just a back-reference, not a
// second FK, so it's intentionally skipped here.
const relations: RelationEdge[] = [];
for (const model of models) {
  for (const f of model.fields) {
    if (!f.isRelation) continue;
    const relAttr = f.attrs.find((a) => a.name === "relation");
    if (!relAttr) continue;
    const fieldsMatch = relAttr.args.match(/fields:\s*\[([^\]]*)\]/);
    const refsMatch = relAttr.args.match(/references:\s*\[([^\]]*)\]/);
    const onDeleteMatch = relAttr.args.match(/onDelete:\s*(\w+)/);
    relations.push({
      fromModel: model.name,
      fromField: f.name,
      toModel: f.baseType,
      fkColumns: fieldsMatch ? fieldsMatch[1].split(",").map((s) => s.trim()) : [],
      refColumns: refsMatch ? refsMatch[1].split(",").map((s) => s.trim()) : [],
      onDelete: onDeleteMatch?.[1],
      optional: f.isOptional,
    });
  }
}

// ---------------------------------------------------------------------------
// Parse prisma/migrations/*/migration.sql — grouped per table, chronological
// ---------------------------------------------------------------------------

const sqlByTable = new Map<string, SqlChunk[]>();
const sqlByEnum = new Map<string, SqlChunk[]>();

function addChunk(map: Map<string, SqlChunk[]>, key: string, migration: string, sql: string) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push({ migration, sql });
}

const migrationDirs = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dir of migrationDirs) {
  const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
  if (!fs.existsSync(sqlPath)) continue;
  const content = fs.readFileSync(sqlPath, "utf8");

  const statements = content
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s + ";");

  for (const stmt of statements) {
    const codeOnly = stmt.replace(/^(--.*\r?\n)+/gm, "");
    const typeMatch = codeOnly.match(/CREATE TYPE "(\w+)"/i);
    const tableMatch =
      codeOnly.match(/CREATE TABLE "(\w+)"/i) ||
      codeOnly.match(/ALTER TABLE "(\w+)"/i) ||
      codeOnly.match(/\bON\s+"(\w+)"/i);

    if (typeMatch) {
      addChunk(sqlByEnum, typeMatch[1], dir, stmt);
    } else if (tableMatch) {
      addChunk(sqlByTable, tableMatch[1], dir, stmt);
    } else {
      addChunk(sqlByTable, "__unclassified__", dir, stmt);
    }
  }
}

// ---------------------------------------------------------------------------
// Mermaid type/key helpers
// ---------------------------------------------------------------------------

const SCALAR_TYPE_MAP: Record<string, string> = {
  String: "string",
  Int: "int",
  Boolean: "boolean",
  DateTime: "datetime",
  Json: "json",
  Float: "float",
  BigInt: "bigint",
  Decimal: "decimal",
  Bytes: "bytes",
};
const enumNames = new Set(enums.map((e) => e.name));

function mermaidType(f: FieldDef): string {
  let base = SCALAR_TYPE_MAP[f.baseType] ?? (enumNames.has(f.baseType) ? f.baseType.toLowerCase() : f.baseType);
  if (f.isList) base += "_array";
  return base;
}

function fkColumnsForModel(modelName: string): Map<string, RelationEdge> {
  const map = new Map<string, RelationEdge>();
  for (const r of relations) {
    if (r.fromModel !== modelName) continue;
    for (const col of r.fkColumns) map.set(col, r);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderFieldTable(model: ModelDef): string {
  const fkMap = fkColumnsForModel(model.name);
  const singleUniqueFields = new Set(
    model.uniqueGroups.filter((g) => g.length === 1).map((g) => g[0]),
  );

  const rows: string[] = [
    "| Field | Type | Null? | Key | Notes |",
    "|---|---|---|---|---|",
  ];

  for (const f of model.fields) {
    if (f.isRelation) continue; // relation object fields aren't real columns

    const keys: string[] = [];
    if (model.pkFields.includes(f.name)) keys.push("PK");
    if (fkMap.has(f.name)) keys.push("FK");
    if (singleUniqueFields.has(f.name) && !keys.includes("PK")) keys.push("UK");

    const notes: string[] = [];
    const defaultAttr = f.attrs.find((a) => a.name === "default");
    if (defaultAttr) notes.push(`default: \`${defaultAttr.args}\``);
    if (f.attrs.some((a) => a.name === "updatedAt")) notes.push("auto-set on update");
    if (f.attrs.some((a) => a.name === "db.Text")) notes.push("TEXT (unbounded)");
    const rel = fkMap.get(f.name);
    if (rel) {
      notes.push(`→ ${rel.toModel}.${rel.refColumns[rel.fkColumns.indexOf(f.name)] ?? "?"}`);
      if (rel.onDelete) notes.push(`ON DELETE ${rel.onDelete}`);
    }

    rows.push(
      `| \`${f.name}\` | ${f.rawType} | ${f.isOptional ? "yes" : "no"} | ${keys.join(", ") || "—"} | ${notes.join("; ") || "—"} |`,
    );
  }

  return rows.join("\n");
}

function renderSqlBlock(chunks: SqlChunk[] | undefined): string {
  if (!chunks || chunks.length === 0) return "_No matching DDL found in prisma/migrations._";
  const body = chunks
    .map((c) => `-- from migrations/${c.migration}/migration.sql\n${c.sql}`)
    .join("\n\n");
  return "```sql\n" + body + "\n```";
}

function renderConstraints(model: ModelDef): string {
  const parts: string[] = [];
  if (model.pkFields.length) parts.push(`- **Primary key**: (${model.pkFields.join(", ")})`);
  for (const g of model.uniqueGroups) parts.push(`- **Unique**: (${g.join(", ")})`);
  for (const g of model.indexGroups) parts.push(`- **Index**: (${g.join(", ")})`);
  return parts.length ? parts.join("\n") : "_None beyond the primary key._";
}

function buildMermaid(): string {
  const out: string[] = ["erDiagram"];

  for (const model of models) {
    const fkMap = fkColumnsForModel(model.name);
    const singleUniqueFields = new Set(
      model.uniqueGroups.filter((g) => g.length === 1).map((g) => g[0]),
    );
    out.push(`    ${model.name} {`);
    for (const f of model.fields) {
      if (f.isRelation) continue;
      const keys: string[] = [];
      if (model.pkFields.includes(f.name)) keys.push("PK");
      if (fkMap.has(f.name)) keys.push("FK");
      if (singleUniqueFields.has(f.name) && !keys.includes("PK")) keys.push("UK");
      const keyStr = keys.length ? ` ${keys.join(",")}` : "";
      const commentParts: string[] = [];
      if (f.isOptional) commentParts.push("nullable");
      const comment = commentParts.length ? ` "${commentParts.join(", ")}"` : "";
      out.push(`        ${mermaidType(f)} ${f.name}${keyStr}${comment}`);
    }
    out.push("    }");
  }

  for (const r of relations) {
    const label = r.optional ? `${r.fromField} (optional)` : r.fromField;
    out.push(`    ${r.toModel} ||--o{ ${r.fromModel} : "${label}"`);
  }

  return out.join("\n");
}

function buildMarkdown(): string {
  const mermaid = buildMermaid();
  const generatedAt = new Date().toISOString();

  const md: string[] = [];
  md.push("# jinteki — Database Schema Reference");
  md.push("");
  md.push(
    `_Generated by \`scripts/generate-schema-doc.ts\` on ${generatedAt} from \`prisma/schema.prisma\` and \`prisma/migrations/\`. Do not hand-edit — re-run \`pnpm docs:schema\` instead._`,
  );
  md.push("");

  const commitLabel = gitInfo.commit ?? "unknown (not a git checkout?)";
  const dirtyLabel =
    gitInfo.dirty === null
      ? ""
      : gitInfo.dirty
        ? " (dirty — uncommitted changes present, doc may not match this commit)"
        : " (clean)";
  const oldestMigration = migrationDirs[0] ?? "(none)";
  const newestMigration = migrationDirs[migrationDirs.length - 1] ?? "(none)";
  md.push(
    `**Source**: commit \`${commitLabel}\`${dirtyLabel} · ${migrationDirs.length} migrations: \`${oldestMigration}\` .. \`${newestMigration}\``,
  );
  md.push("");
  md.push("<details><summary>Full migration list</summary>");
  md.push("");
  md.push(migrationDirs.length ? migrationDirs.map((d) => `- \`${d}\``).join("\n") : "_No migrations found._");
  md.push("");
  md.push("</details>");
  md.push("");
  md.push(`${models.length} models, ${enums.length} enums, ${relations.length} foreign-key relationships.`);
  md.push("");

  md.push("## Entity-relationship diagram");
  md.push("");
  md.push("```mermaid");
  md.push(mermaid);
  md.push("```");
  md.push("");

  md.push("## Enums");
  md.push("");
  for (const e of enums) {
    md.push(`### \`${e.name}\``);
    if (e.description) {
      md.push("");
      md.push(e.description);
    }
    md.push("");
    md.push(e.values.map((v) => `- \`${v}\``).join("\n"));
    md.push("");
    md.push(renderSqlBlock(sqlByEnum.get(e.name)));
    md.push("");
  }

  md.push("## Models");
  md.push("");
  for (const model of models) {
    md.push(`### \`${model.name}\``);
    if (model.description) {
      md.push("");
      md.push(model.description);
    }
    md.push("");
    md.push(renderFieldTable(model));
    md.push("");
    md.push("**Constraints**");
    md.push("");
    md.push(renderConstraints(model));
    md.push("");
    md.push("<details><summary>Raw SQL (from prisma/migrations)</summary>");
    md.push("");
    md.push(renderSqlBlock(sqlByTable.get(model.name)));
    md.push("");
    md.push("</details>");
    md.push("");
  }

  md.push("## Relationships");
  md.push("");
  md.push("| From | FK column(s) | To | References | On delete | Optional? |");
  md.push("|---|---|---|---|---|---|");
  for (const r of relations) {
    md.push(
      `| \`${r.fromModel}\`.\`${r.fromField}\` | ${r.fkColumns.map((c) => `\`${c}\``).join(", ")} | \`${r.toModel}\` | ${r.refColumns.map((c) => `\`${c}\``).join(", ")} | ${r.onDelete ?? "(default: Restrict)"} | ${r.optional ? "yes" : "no"} |`,
    );
  }
  md.push("");

  const unclassified = sqlByTable.get("__unclassified__");
  if (unclassified && unclassified.length) {
    md.push("## Unclassified SQL statements");
    md.push("");
    md.push(
      "_Statements the parser couldn't attribute to a specific table (review manually):_",
    );
    md.push("");
    md.push(renderSqlBlock(unclassified));
    md.push("");
  }

  return md.join("\n");
}

// Machine-readable export of the same parsed structure, for tooling
// (e.g. a rendered visual preview) that shouldn't re-implement the parser.
function buildJson() {
  const fkColumnsByModel: Record<string, Record<string, RelationEdge>> = {};
  for (const m of models) {
    fkColumnsByModel[m.name] = Object.fromEntries(fkColumnsForModel(m.name));
  }
  return {
    generatedAt: new Date().toISOString(),
    source: {
      commit: gitInfo.commit,
      dirty: gitInfo.dirty,
      migrations: {
        count: migrationDirs.length,
        names: migrationDirs,
      },
    },
    enums,
    models: models.map((m) => ({
      ...m,
      fields: m.fields
        .filter((f) => !f.isRelation)
        .map((f) => ({
          ...f,
          mermaidType: mermaidType(f),
          isPk: m.pkFields.includes(f.name),
          isFk: fkColumnsByModel[m.name][f.name] !== undefined,
          isUnique:
            m.uniqueGroups.some((g) => g.length === 1 && g[0] === f.name) &&
            !m.pkFields.includes(f.name),
          fk: fkColumnsByModel[m.name][f.name] ?? null,
        })),
      sql: (sqlByTable.get(m.name) ?? []).map((c) => c.sql),
    })),
    relations,
  };
}

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, buildMarkdown(), "utf8");
fs.writeFileSync(OUT_MMD, buildMermaid(), "utf8");
fs.writeFileSync(OUT_JSON, JSON.stringify(buildJson(), null, 2), "utf8");

console.log(`Wrote ${path.relative(ROOT, OUT_MD)}`);
console.log(`Wrote ${path.relative(ROOT, OUT_MMD)}`);
console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}`);
console.log(`${models.length} models, ${enums.length} enums, ${relations.length} relations parsed.`);
