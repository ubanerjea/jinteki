// Scrapes rules.nullsignal.games's Comprehensive Rules into section-level
// RuleSection rows (e.g. "3.5 Operations"), per PROJECT_PLAN.md's decision to
// store the rules doc at section granularity - sub-clauses (3.5.1, 3.6.5a,
// etc.) are folded into their parent section's bodyText rather than split
// into their own rows.
//
// DOM structure confirmed by fetching the live page directly (2026-07-28),
// not assumed from the original architecture-interview research (which never
// inspected the real HTML): the page is plain server-rendered HTML (no JS
// rendering needed - a raw `fetch().text()` returns the full document, byte
// count matches a `curl` of the same URL). Inside <div id="RulesContent">,
// a sibling <main> element contains a FLAT sequence of:
//   - <h1 class="Chapter" id="chpt_..."> - chapter headings (e.g.
//     "3. Card Types"). Not stored as their own row - just group sections.
//   - <h2 class="Section" id="sec_..."> - numbered section headings (e.g.
//     "3.5. Operations"). One RuleSection row per h2, keyed on the leading
//     number ("3.5").
//   - <ol class="Rules">/<ol class="SubRules"> (and a couple of other list
//     classes, e.g. "TimingStructureList" in the appendix chapter) containing
//     the section's numbered clauses (<li class="Rule" id="rule_..."> with
//     "3.5.1." + a <span class="RuleText">) and lettered sub-clauses
//     (<li class="SubRule" id="rule_..."> with "a." + RuleText).
//   - "Sub-sections" like "3.6.5 Regions" (anchor `subsec_regions`) are NOT
//     a separate heading level - they're plain <li class="Rule"> items (same
//     shape as a numbered clause) whose content is a <span class="SubSection">
//     instead of a <span class="RuleText">. Confirmed live: this is what
//     PHASE_3_PLAN.md's "sub-clauses folded into their parent section" means
//     in practice - anything between one h2.Section and the next h1/h2
//     belongs to the current section, no matter what list/class wraps it.
// Total live h2.Section count at the time of this scrape: 119 (across 11
// h1.Chapter groupings) - the plausibility check used during verification.
//
// The live page displays its own revision: <title>Netrunner Comprehensive
// Rules (v26.03)</title>, with "This version ... is effective 02 March
// 2026." in the page body. Useful context for knowing whether a re-scrape
// changed anything; the sync itself doesn't gate on it (full resync any
// time is fine, per the architecture's "manual sync" decision).

import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { SyncType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export const RULES_URL = "https://rules.nullsignal.games/";

export interface ParsedRuleSection {
  id: string;
  title: string;
  anchor: string;
  bodyText: string;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Recursively joins every text node's own trimmed content with a single
// space. Deliberately NOT cheerio's own `.text()`: adjacent inline elements
// in the source HTML have zero whitespace between them (e.g.
// `<a class="RuleLink">3.5.1.</a><span class="RuleText">Operations are...`),
// so `.text()` would glue them into "3.5.1.Operations are...". This also
// deliberately avoids `.find('*').addBack()` (tried first, then discarded):
// cheerio's `addBack()` does not preserve document order relative to the
// found set, which silently reordered and in one case dropped text - a
// plain recursive walk over `.contents()` (cheerio's own typed API, so no
// need to import domhandler's node types directly) is what's used instead.
function collectText(
  $: CheerioAPI,
  $el: Cheerio<AnyNode>,
  parts: string[],
): void {
  $el.contents().each((_, node) => {
    if (node.type === "text") {
      const data = (node as { data: string }).data;
      if (data.trim()) parts.push(data.trim());
    } else {
      collectText($, $(node), parts);
    }
  });
}

function allText($: CheerioAPI, $el: Cheerio<AnyNode>): string {
  const parts: string[] = [];
  collectText($, $el, parts);
  return cleanText(parts.join(" "));
}

// Matches a leading section number like "3.5" or "11.6" off the h2's full
// text (e.g. "3.5. Operations" -> ["3.5", "Operations"]). Falls back to
// using the anchor/full text verbatim if a heading doesn't match - so a
// future doc change surfaces as an odd-looking row rather than a silent
// drop or a thrown error killing the whole scrape.
const SECTION_NUMBER_RE = /^(\d+(?:\.\d+)*)\.\s*(.*)$/;

interface InProgressSection {
  id: string;
  title: string;
  anchor: string;
  bodyParts: string[];
}

/**
 * Parses the rules.nullsignal.games HTML into one row per numbered section.
 * Pure function (no network access) so it can be unit-tested against a
 * recorded fixture.
 */
export function parseRuleSections(html: string): ParsedRuleSection[] {
  const $ = cheerio.load(html);
  const main = $("main");
  if (main.length === 0) {
    throw new Error(
      "parseRuleSections: no <main> element found - the page structure may have changed",
    );
  }

  const sections: ParsedRuleSection[] = [];
  let current: InProgressSection | null = null;

  const flush = () => {
    if (current) {
      sections.push({
        id: current.id,
        title: current.title,
        anchor: current.anchor,
        bodyText: cleanText(current.bodyParts.join(" ")),
      });
    }
  };

  main.children().each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();

    if (tag === "h2" && $el.hasClass("Section")) {
      flush();
      const anchor = $el.attr("id") ?? "";
      const fullText = allText($, $el);
      const match = SECTION_NUMBER_RE.exec(fullText);
      current = {
        id: match ? match[1] : anchor,
        title: match ? match[2] : fullText,
        anchor,
        bodyParts: [],
      };
      return;
    }

    if (tag === "h1" && $el.hasClass("Chapter")) {
      // Chapter heading (e.g. "3. Card Types") - groups sections but isn't
      // itself a numbered section, so it produces no RuleSection row. The
      // section immediately following it starts a fresh `current`.
      return;
    }

    // Anything else (ol.Rules, ol.SubRules, ol.TimingStructureList, stray
    // <p> snippets, etc.) is body content belonging to the current section.
    // Content appearing before the first h2.Section (there is none in the
    // live doc - every h1.Chapter is immediately followed by an h2.Section -
    // but if that ever changed) is silently skipped rather than throwing,
    // since it isn't section-shaped data this scraper's schema can store.
    if (current) {
      const text = allText($, $el);
      if (text) current.bodyParts.push(text);
    }
  });

  flush();

  return sections;
}

export async function runRulesSync() {
  return withSyncRun(SyncType.RULES, async () => {
    const res = await fetch(RULES_URL);
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable body>");
      throw new Error(
        `Failed to fetch ${RULES_URL}: ${res.status} ${res.statusText} - ${body.slice(0, 500)}`,
      );
    }
    const html = await res.text();
    const sections = parseRuleSections(html);

    // A parsing-logic regression (e.g. the live page's DOM structure
    // changing) would otherwise silently upsert 0 or a handful of rows and
    // still report "SUCCESS" - fail loudly instead so it shows up as a
    // FAILED SyncRun rather than a quietly wrong one.
    if (sections.length < 50) {
      throw new Error(
        `parseRuleSections only found ${sections.length} section(s) - expected on the order of 100+; the page structure may have changed`,
      );
    }

    for (const section of sections) {
      await prisma.ruleSection.upsert({
        where: { id: section.id },
        update: {
          title: section.title,
          anchor: section.anchor,
          bodyText: section.bodyText,
        },
        create: section,
      });
    }

    return sections.length;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runRulesSync()
    .then((run) => {
      console.log(
        `[sync:rules] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:rules] fatal error", error);
      process.exit(1);
    });
}
