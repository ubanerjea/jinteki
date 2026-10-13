// Reads a Netrunner decklist file and reports which data pack each card comes from.
// Null Signal Games packs are listed first, organized by cycle then pack.
// Non-NSG cards and unrecognized entries appear in separate trailing sections.
//
// Prisma loads DATABASE_URL from .env automatically; run from the repo root.
//
// PowerShell (from repo root):
//   pnpm tsx scripts/decklist-packs.ts "C:\path\to\deck.txt"
//   pnpm tsx scripts/decklist-packs.ts "C:\path\to\deck.txt" "C:\path\to\out.txt"
//
// Bash (from repo root):
//   pnpm tsx scripts/decklist-packs.ts ~/path/to/deck.txt
//   pnpm tsx scripts/decklist-packs.ts ~/path/to/deck.txt ~/path/to/out.txt
//
// Bash on Windows (Git Bash) — drive letters map as /c/, /d/, etc.:
//   pnpm tsx scripts/decklist-packs.ts "/c/Users/you/path/to/deck.txt"
//   pnpm tsx scripts/decklist-packs.ts "/c/Users/you/path/to/deck.txt" "/c/Users/you/path/to/out.txt"
// e.g. if decklist is at "C:\Users\Unz\Pictures\Netrunner\decklists\NBN R+ funnty.txt"
// the equivalent bash invocation to generate the pack breadown is: 
//   pnpm tsx scripts/decklist-packs.ts "/c/Users/Unz/Pictures/Netrunner/decklists/NBN R+ funnty.txt"
//
// If no output path is given, writes <input-stem>-packs.txt alongside the input.

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Normalisation — used for matching only; original names are kept for display
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritical combining marks (ü→u)
      .replace(/[''`´]/g, "") // strip apostrophe variants (Tomorrow's→Tomorrows)
      .replace(/[^a-z0-9 ]/gi, " ") // collapse remaining punctuation to space
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ParsedCard {
  quantity: number;
  rawName: string; // name as written in the file, pips stripped
  pips: string; // faction influence dots, e.g. "●●●", empty when in-faction
  isIdentity: boolean;
}

function parseDecklist(text: string): ParsedCard[] {
  const results: ParsedCard[] = [];
  let identityFound = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Lines starting with a digit: "3  Bahia Bands ●●●"
    const qtyMatch = line.match(/^(\d+)\s+/);
    if (qtyMatch) {
      const quantity = parseInt(qtyMatch[1], 10);
      const rest = line.slice(qtyMatch[0].length);

      // Split at the first pip character; keep only actual pip chars for display
      const pipIdx = rest.search(/[●•]/);
      const rawName = (pipIdx >= 0 ? rest.slice(0, pipIdx) : rest).trim();
      const pips =
        pipIdx >= 0 ? rest.slice(pipIdx).replace(/[^●•]/g, "").trim() : "";

      if (rawName) results.push({ quantity, rawName, pips, isIdentity: false });
      continue;
    }

    // Section headers end with "(N)" — skip them
    if (/\(\d+\)\s*$/.test(line)) continue;

    // First non-blank, non-header, non-quantity line: treat as the identity
    if (!identityFound) {
      identityFound = true;
      results.push({ quantity: 1, rawName: line, pips: "", isIdentity: true });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Pack data
// ---------------------------------------------------------------------------

type PackInfo = {
  code: string;
  name: string;
  dateRelease: Date | null;
  cycle: { id: string; name: string; dateRelease: Date | null } | null;
};

// NISEI (later renamed Null Signal Games) took over from FFG after the
// Ashes cycle. Downfall, NISEI's first original release, shipped 2019-03-18.
// Use 2019-01-01 as the threshold so the Ashes cycle is classified as NSG.
const NSG_CUTOFF = new Date("2019-01-01");

function isNSGPack(p: PackInfo): boolean {
  const ref = p.cycle?.dateRelease ?? p.dateRelease;
  return ref != null && ref > NSG_CUTOFF;
}

// ---------------------------------------------------------------------------
// DB lookup + matching
// ---------------------------------------------------------------------------

type DbCard = {
  title: string;
  typeCode: string;
  packCode: string | null;
  raw: unknown;
};

function cardSetIds(raw: unknown): string[] {
  // NRDB v3 stores the full resource object; card_set_ids is at attributes.card_set_ids,
  // ordered newest-first (same ordering used by sync-cards.ts, which takes the last
  // entry as the original pack).
  try {
    const obj = raw as Record<string, unknown>;
    const attrs = obj["attributes"] as Record<string, unknown> | undefined;
    const ids = attrs?.["card_set_ids"];
    if (Array.isArray(ids)) return ids as string[];
  } catch {
    /* malformed raw — treat as empty */
  }
  return [];
}

// Resolve which pack to display for a card. Prefers the card's original packCode
// if it's already an NSG pack; otherwise walks card_set_ids (newest-first) for
// the first NSG printing. Falls back to the original packCode if nothing NSG is
// found (card has no NSG release).
function resolveDisplayPack(
  dbCard: DbCard,
  packByCode: Map<string, PackInfo>,
  nsgPackCodes: Set<string>,
): { pack: PackInfo; isNSG: boolean } | null {
  const originalCode = dbCard.packCode;

  // Original pack is NSG — use it directly
  if (originalCode && nsgPackCodes.has(originalCode)) {
    const pack = packByCode.get(originalCode);
    if (pack) return { pack, isNSG: true };
  }

  // Walk card_set_ids for the first NSG printing (newest-first, so this is the
  // most recent NSG product the card appears in)
  for (const code of cardSetIds(dbCard.raw)) {
    if (nsgPackCodes.has(code)) {
      const pack = packByCode.get(code);
      if (pack) return { pack, isNSG: true };
    }
  }

  // No NSG pack found — fall back to original pack as non-NSG
  if (originalCode) {
    const pack = packByCode.get(originalCode);
    if (pack) return { pack, isNSG: false };
  }

  return null;
}

interface Matched {
  card: ParsedCard;
  dbTitle: string;
  pack: PackInfo;
  isNSG: boolean;
}

interface Unmatched {
  card: ParsedCard;
  suggestions: string[];
}

function findSuggestions(
  normInput: string,
  cardByNorm: Map<string, DbCard>,
): string[] {
  const inputWords = normInput.split(" ").filter(Boolean);
  const hits: string[] = [];
  for (const [norm, dbCard] of cardByNorm) {
    const allWords =
      inputWords.length > 1 && inputWords.every((w) => norm.includes(w));
    const substring = norm.includes(normInput) || normInput.includes(norm);
    if (allWords || substring) hits.push(dbCard.title);
  }
  return hits.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "date unknown";
}

function fmtCard(m: Matched): string {
  const pips = m.card.pips ? `  ${m.card.pips}` : "";
  const tag = m.card.isIdentity ? "  [IDENTITY]" : "";
  return `  ${m.card.quantity}x ${m.dbTitle}${pips}${tag}`;
}

type PackGroup = { packName: string; packDate: Date | null; cards: Matched[] };
type CycleGroup = {
  cycleName: string;
  cycleDate: Date | null;
  isNSG: boolean;
  packs: Map<string, PackGroup>;
};

function groupByCycle(matched: Matched[]): Map<string, CycleGroup> {
  const cycles = new Map<string, CycleGroup>();
  for (const m of matched) {
    const cycleId = m.pack.cycle?.id ?? "__unknown__";
    const cycleName = m.pack.cycle?.name ?? "Unknown Cycle";
    const cycleDate = m.pack.cycle?.dateRelease ?? null;
    if (!cycles.has(cycleId)) {
      cycles.set(cycleId, { cycleName, cycleDate, isNSG: m.isNSG, packs: new Map() });
    }
    const cg = cycles.get(cycleId)!;
    if (!cg.packs.has(m.pack.code)) {
      cg.packs.set(m.pack.code, { packName: m.pack.name, packDate: m.pack.dateRelease, cards: [] });
    }
    cg.packs.get(m.pack.code)!.cards.push(m);
  }
  return cycles;
}

function sortedPacks(pg: Map<string, PackGroup>): PackGroup[] {
  return [...pg.values()].sort(
    (a, b) => (a.packDate?.getTime() ?? 0) - (b.packDate?.getTime() ?? 0),
  );
}

function sortedCycles(cg: Map<string, CycleGroup>): CycleGroup[] {
  return [...cg.values()].sort(
    (a, b) => (a.cycleDate?.getTime() ?? 0) - (b.cycleDate?.getTime() ?? 0),
  );
}

function sortCards(cards: Matched[]): Matched[] {
  return [...cards].sort((a, b) => {
    if (a.card.isIdentity !== b.card.isIdentity) return a.card.isIdentity ? -1 : 1;
    return a.dbTitle.localeCompare(b.dbTitle);
  });
}

function buildOutput(
  deckName: string,
  nsgCycles: CycleGroup[],
  nonNsgCycles: CycleGroup[],
  unmatched: Unmatched[],
): string {
  const lines: string[] = [];

  const title = `${deckName} — Cards by Data Pack`;
  lines.push(title, "=".repeat(title.length), "");

  for (const cg of nsgCycles) {
    lines.push(`-- ${cg.cycleName.toUpperCase()} CYCLE --`, "");
    for (const pg of sortedPacks(cg.packs)) {
      lines.push(`${pg.packName} (${fmtDate(pg.packDate)})`);
      for (const m of sortCards(pg.cards)) lines.push(fmtCard(m));
      lines.push("");
    }
  }

  if (nonNsgCycles.length > 0) {
    lines.push("-- NOT FROM NULL SIGNAL --", "");
    for (const cg of nonNsgCycles) {
      for (const pg of sortedPacks(cg.packs)) {
        const label =
          cg.cycleName !== pg.packName
            ? `${pg.packName} (${cg.cycleName} cycle)`
            : pg.packName;
        lines.push(label);
        for (const m of sortCards(pg.cards)) lines.push(fmtCard(m));
        lines.push("");
      }
    }
  }

  if (unmatched.length > 0) {
    lines.push(
      "-- COULD NOT CONFIRM --",
      "(Card names not found in database — check spelling, or card may not be synced yet.)",
      "",
    );
    for (const u of unmatched) {
      if (u.suggestions.length > 0) {
        lines.push(`  ${u.card.quantity}x ${u.card.rawName}`);
        lines.push(`       → Did you mean: ${u.suggestions.join(" / ")}?`);
      } else {
        lines.push(`  ${u.card.quantity}x ${u.card.rawName}  (no close match found)`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    console.error("Usage: pnpm tsx scripts/decklist-packs.ts <decklist.txt> [output.txt]");
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const parsed = parseDecklist(fs.readFileSync(inputPath, "utf8"));
  if (parsed.length === 0) {
    console.error("No cards found in decklist.");
    process.exit(1);
  }

  // Build a pack lookup and NSG pack code set from one query
  const allPacks = await prisma.pack.findMany({
    select: {
      code: true,
      name: true,
      dateRelease: true,
      cycle: { select: { id: true, name: true, dateRelease: true } },
    },
  });

  const packByCode = new Map<string, PackInfo>();
  const nsgPackCodes = new Set<string>();
  for (const p of allPacks) {
    packByCode.set(p.code, p);
    if (isNSGPack(p)) nsgPackCodes.add(p.code);
  }

  // Fetch entire card catalogue; raw is needed to check card_set_ids for reprints
  const allCards = await prisma.card.findMany({
    select: { title: true, typeCode: true, packCode: true, raw: true },
  });

  const cardByNorm = new Map<string, DbCard>();
  for (const c of allCards) {
    const key = normalise(c.title);
    if (!cardByNorm.has(key)) cardByNorm.set(key, c);
  }

  const matched: Matched[] = [];
  const unmatched: Unmatched[] = [];

  for (const card of parsed) {
    const key = normalise(card.rawName);
    const dbCard = cardByNorm.get(key);

    if (dbCard) {
      const resolved = resolveDisplayPack(dbCard, packByCode, nsgPackCodes);
      if (resolved) {
        matched.push({ card, dbTitle: dbCard.title, ...resolved });
      } else {
        // In DB but no pack info at all
        matched.push({
          card,
          dbTitle: dbCard.title,
          pack: { code: "__no_pack__", name: "Unknown Pack", dateRelease: null, cycle: null },
          isNSG: false,
        });
      }
    } else {
      unmatched.push({ card, suggestions: findSuggestions(key, cardByNorm) });
    }
  }

  const cycles = groupByCycle(matched);
  const all = sortedCycles(cycles);
  const nsgCycles = all.filter((c) => c.isNSG);
  const nonNsgCycles = all.filter((c) => !c.isNSG);

  const deckName = path.basename(inputPath, path.extname(inputPath));
  const output = buildOutput(deckName, nsgCycles, nonNsgCycles, unmatched);

  const outPath = outputArg
    ? path.resolve(outputArg)
    : path.join(path.dirname(inputPath), `${deckName} - packs.txt`);

  fs.writeFileSync(outPath, output, "utf8");
  console.log(`Written: ${outPath}`);
  console.log(`  ${matched.length} card(s) matched, ${unmatched.length} unmatched`);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
<<<<<<< HEAD

//appendix: notes on current usage for FFG editions, NSG editions, and cards which appear in both FFG and NSG editions
/* 
> would the current script work for eternal format decks which contain cards only printed in FFG editions, cards only printed in NSG edititions, and cards printed in both? what version would it choose in each case?

* Yes, it works for all three cases. Here's exactly what resolveDisplayPack picks in each:

  Cards only in NSG editions (e.g. Carpe Diem, only in Midnight Sun)
  - packCode is already an NSG pack → first check passes → shows original NSG pack ✓

  Cards only in FFG editions (e.g. something only printed in Mumbad cycle, never reprinted)
  - packCode is FFG → first check fails
  - card_set_ids contains only FFG codes → walk finds nothing
  - Falls back to original FFG pack, isNSG: false → "NOT FROM NULL SIGNAL" section ✓

  Cards printed in both — depends on which came first:

  - Originally FFG, later reprinted by NSG (e.g. Sure Gamble): packCode is core_set (FFG), so first check fails. The walk through card_set_ids (newest-first) finds the first NSG reprint — shows that newer NSG pack (System Gateway in Sure Gamble's case).
  - Originally NISEI/NSG, later reprinted in a newer NSG set: packCode is the original NISEI pack, which passes the first check immediately — shows the original NSG pack, not the newer reprint.

  So there's a minor inconsistency in the "both" case: FFG-origin cards show their newest NSG printing, while NSG-origin cards show their oldest (original) NSG printing. In practice this is probably fine — for FFG-origin cards you want to know where NSG makes them
  available, and for NSG-origin cards you'd typically want the original release. But worth knowing if you ever see a card grouped under an unexpected pack.
  */

=======
>>>>>>> fbb60e790cec075fa6111ed41695920c3f8e3eb3
