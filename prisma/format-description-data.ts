// Hand-curated Format descriptions - NRDB's v3 `/formats` API has no
// description/summary field at all (confirmed live 2026-07-30 against
// GET /formats - see
// agent-reports/format-descriptions-links-and-search-plan.md §2a), so
// there's nothing to sync. Same pattern as prisma/rule-mapping-data.ts:
// a small, reviewable-as-a-plain-diff seed file rather than a DB-editable
// admin table, since these six rows change on the order of once a year (a
// new format is added vanishingly rarely; existing descriptions only
// change if NSG rewrites its own explainer copy).
//
// Content drafted and reviewed during the planning pass (see the plan doc
// above, §3) - copied verbatim here, not rewritten.
export const formatDescriptionData: { id: string; description: string }[] = [
  {
    id: "standard",
    description:
      "The flagship rotating format. The card pool is the two non-rotating " +
      "Core Sets (System Gateway and Elevation) plus the most recent complete " +
      "cycles — currently Ashes, Borealis, Liberation, and the newest release, " +
      "Vantage Point. When a new cycle completes, the oldest cycle in the pool " +
      "rotates out. Uses a simple ban list (currently 19 Corp and 13 Runner " +
      "cards banned) rather than a points system.",
  },
  {
    id: "startup",
    description:
      "A smaller format aimed at newer players. The card pool is the Core " +
      "Sets plus only the single most recent complete cycle and the current " +
      "incomplete cycle — never more than five sets at once. It rotates on " +
      "the same cadence as Standard, always trailing one cycle behind. Has " +
      "its own smaller ban list (5 Corp, 1 Runner) plus an extra deckbuilding " +
      "rule capping how many high-value agendas a deck can run.",
  },
  {
    id: "eternal",
    description:
      "The non-rotating format — essentially every card ever printed for " +
      "the game is legal. Instead of a ban list, Eternal uses a points " +
      "system: each deck has a budget (currently 7 points) to spend on cards " +
      "flagged as powerful, plus a small list of cards banned outright. This " +
      "is deliberately a lighter-touch approach than Standard's ban list, " +
      "given how much larger the Eternal card pool is.",
  },
  {
    id: "snapshot",
    description:
      "A frozen, point-in-time format. The card pool is fixed at exactly " +
      "what was tournament-legal under the original publisher's (FFG) " +
      "organized play program on November 16, 2018 — Creation and Control " +
      "through Reign and Reverie. Snapshot has its own frozen banned/" +
      "restricted list from that era and never changes.",
  },
  {
    id: "ram",
    description:
      "Random Access Memories (RAM) isn't a fixed card pool. Every two " +
      "weeks, a new legal pool is drawn live on stream: 2 large releases " +
      "plus 12 data packs, picked from an eligible set (a handful of sets " +
      "are permanently excluded). Whatever's drawn is legal as-is for the " +
      "next two weeks — there's no ban list at all. Originated as a " +
      "'Mystery Box' Worlds side event before becoming a recurring official " +
      "format.",
  },
  {
    id: "system_gateway",
    description:
      "The original March 2021 starter-set card pool — just the cards from " +
      "the System Gateway two-player starter set, predating the later " +
      "Elevation expansion that's now bundled alongside it as part of the " +
      "'Core Sets.' No ban list.",
  },
];
