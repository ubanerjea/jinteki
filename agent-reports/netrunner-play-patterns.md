# Netrunner Play Patterns — for jinteki's "How to Play" / FAQ Layer

## 1. Purpose and scope

This report describes how Netrunner is actually *played* — the practitioner-level patterns a new player needs — as a foundation for a future "how to play" layer sitting on top of jinteki's existing rule-section reference (the ~119-section `RuleSection` table already scraped from NSG's Comprehensive Rules). It deliberately does not restate the Comprehensive Rules' legalese; it's written the way a patient, experienced player would explain the game across a kitchen table.

**A naming note up front**: the game was originally published by Fantasy Flight Games (FFG) as *Android: Netrunner*. FFG discontinued support in 2018; a fan organization, Null Signal Games (NSG, formerly NISEI), has maintained and continued developing the game since, publishing new cards and its own Comprehensive Rules. NSG's own materials now refer to the game simply as **Netrunner** (dropping "Android"), and this report follows that convention except where quoting older FFG-era sources.

**Sourcing discipline**: every substantive claim below is traceable to one of the sources listed in §7. Where a claim rests on general community knowledge rather than something directly fetched this session, it's flagged inline as such — same discipline as `agent-reports/scryfall-ux-research.md`.

---

## 2. The core asymmetry

Netrunner is a two-player game where the two sides don't just have different cards (as in a normal CCG) — they play a **structurally different game** with different objectives, different resources, different card types, and different turn actions. One player is always **Corp** (a megacorporation), the other always **Runner** (a hacker). You don't choose a "faction" that could be either side, the way you would in, say, Magic; Corp and Runner decks are built from entirely separate card pools and cannot be mixed.

- **The Corp's goal**: score 7 **agenda points**. Agendas are cards representing the Corp's secret plans; they sit in the Corp's hand doing nothing until installed face-down in a server, then **advanced** over multiple turns (paying a click and a credit per advancement) until they've accumulated enough advancement counters, at which point the Corp can **score** them into their score area for points. [nullsignal.games/players/learn-to-play/learn-to-play-corp/]
- **The Runner's goal**: also score 7 agenda points, but by the opposite method — breaking into (**running**) the Corp's servers and **stealing** agendas found there before the Corp can score them. [nullsignal.games/players/learn-to-play/learn-to-play-runner/]
- Both sides need exactly the same number of agenda points (**7 normally, 6 in the System Gateway teaching/starter game**) to win — the asymmetry is entirely in *how* each side pursues that number, not in what number they're chasing. [nullsignal.games learn-to-play-corp/-runner pages; corroborated by the ANCUR unofficial-rules wiki FAQ]
- This produces the game's central tension: the Corp wants to **build and defend** — install cards face-down (a state called **unrezzed**), protect servers with layers of security programs called **ice**, and quietly advance agendas toward scoring, all while managing what information it reveals. The Runner wants to **attack and disrupt** — probe which servers are worth attacking, break through ice, and grab agendas (or otherwise sabotage the Corp's plans) before the Corp can lock the game down. [synthesis of nullsignal.games learn-to-play pages]
- **Two additional "you lose immediately" conditions exist alongside the agenda-point race**, and each is effectively a secondary win path for the opposing side:
  - If the Corp is ever required to draw a card from an empty R&D (its deck), the **Corp loses immediately** ("decking out"). This means a Runner strategy centered on attacking R&D and forcing extra draws is a legitimate alternate win path, not just an economic drain.
  - If the Runner is ever required to discard/trash a card from an empty grip (hand) due to damage, the **Runner loses immediately** ("flatlining"). A Corp strategy built around damage ("kill") is likewise a legitimate alternate win path.
  [cryoffrustration.wordpress.com newbie-mistakes article, "Losing Conditions" section]

---

## 3. Turn structure and click economy

Both sides' turns are built around **clicks** (units of time/action, the basic currency of "doing things on your turn") and **credits** (in-game money). [nullsignal.games learn-to-play-corp: "Clicks: Represent time and determine available actions per turn; Credits: Represent money needed to install cards and rez defenses"]

- **Corp turn**: draws 1 card automatically at the start of the turn (a *mandatory* draw, costing no click), then has **3 clicks** to spend on actions. [nullsignal.games/players/learn-to-play/learn-to-play-corp/, directly quoted: "Each turn, the Corp draws a mandatory card, then spends three clicks taking actions."]
- **Runner turn**: has **no mandatory draw** — drawing is itself an optional click action — and gets **4 clicks** to spend. [nullsignal.games/players/learn-to-play/learn-to-play-runner/, directly quoted: "On each of your turns you have FOUR clicks to spend; essentially, you get to do four things on your turn."]
- This 3-vs-4 split is one of the clearest expressions of the game's asymmetry: the Runner gets more raw actions per turn, but the Corp's actions are typically more "compounding" (advancing agendas, building durable board state) while many Runner clicks go toward the single-use act of running.
- **Basic click actions available to both sides** (each costs 1 click unless noted): gain 1 credit; draw 1 card; install a card (paying its cost); play a card ability. Side-specific basic actions: the **Corp** can additionally *advance* an installed card (1 click + 1 credit) and *score* an agenda that has enough advancement counters (this costs no click — see §4); the **Runner** can additionally *run* a server (1 click) and *remove one tag from itself* (1 click + 2 credits). [nullsignal.games learn-to-play pages; tag-removal cost corroborated by cryoffrustration.wordpress.com and UltraBoardGames]
- **Rezzing ice/assets costs credits only, never a click** — this is a common point new players get wrong (see Report 2, Q2). [cryoffrustration.wordpress.com: "Rezzing cost: Rezzing costs no clicks, only installing does"; corroborated by nullsignal.games rules search result: "Rezzing cards does not cost clicks"]
- Unspent clicks are simply lost at end of turn — there's no banking clicks or credits across turns beyond whatever's already in your credit pool (credits *do* persist turn to turn, unlike clicks). [general knowledge, not directly sourced this session — standard, uncontroversial rule]

---

## 4. Corp's basic play pattern

1. **Draw** the mandatory card.
2. **Install** cards face-down into servers using clicks + credits:
   - **Ice** installs into a specific server, always as the new *outermost* layer, positioned so the Runner must pass every existing piece of ice on that server before reaching the new one. Installing ice costs its install cost **plus 1 credit per piece of ice already protecting that server** — deterring "ice-stacking" from being free. [nullsignal.games learn-to-play-corp; cost detail corroborated by cryoffrustration.wordpress.com]
   - **Agendas, assets, and upgrades** install face-down (unrezzed) into servers. Assets and agendas can only go into **remote servers** (Corp-created servers beyond the three fixed central ones), one per server "root." Upgrades can go into any server, central or remote, and multiple upgrades can share a server. [nullsignal.games learn-to-play-corp; corroborated by cryoffrustration.wordpress.com "Remotes" section]
3. **Rez** (pay the printed rez cost to flip face-up and activate) assets/upgrades whenever useful, and ice specifically **only while a Runner is approaching that exact piece of ice during a run** — this is the Corp's one narrow rez window for ice, and it's what makes ice bluffing possible (see §6 and Report 2, Q16). [nullsignal.games/players/learn-to-play/run-guide/: "The only time the Corp can rez a piece of ice is while the Runner is approaching that ice"; corroborated by cryoffrustration.wordpress.com: "ICE can ONLY be rezzed during a run"]
4. **Advance** installed agendas (and sometimes ice/assets, for card-specific effects) by spending a click + a credit per advancement counter, until the card's printed advancement requirement is met.
5. **Score** the agenda: once it has enough advancement counters, the Corp may score it at any point during their own turn (no click cost) — moving it to the score area, banking its agenda points, and triggering any on-score ability. [nullsignal.games learn-to-play-corp, directly quoted: "Once an agenda has enough advancement counters on it to meet its advancement requirement, you can SCORE it"; no-click-cost detail corroborated by cryoffrustration.wordpress.com]
6. Throughout, the Corp also plays **operations** (one-time-effect cards played face-up from hand, resolved, then discarded — never installed) to generate credits, draw cards, or trigger effects, funding the install/rez/advance/score loop. [nullsignal.games learn-to-play-corp]

The Corp is not obligated to spend every turn racing to score — a turn spent purely building ice, banking credits, or holding cards to preserve bluffing options is completely normal (see Report 2, Q15).

---

## 5. Runner's basic play pattern

1. **Build a rig**: install programs (especially **icebreakers** — programs that let the Runner interact with and break ice) and other cards (hardware, resources) into their play area, called the **rig**, paying install costs from clicks + credits. Icebreakers come in three main flavors matching the three main ice types: **fracters** break barriers, **decoders** break code gates, **killers** break sentries; **AI breakers** can interact with any ice type but usually carry a drawback (e.g., trashing themselves after use). [nullsignal.games learn-to-play-runner]
2. **Run** a server (1 click) — this is the Runner's core offensive action. A run resolves in a defined sequence (full step-by-step detail in Report 2, Q3–Q6): the Runner picks a target server and, if it has ice, **approaches** the outermost piece first. The Corp gets one narrow window to **rez** that ice as it's approached; if rezzed, the Runner **encounters** it and must decide how to handle its **subroutines** — printed, numbered abilities that fire automatically unless the Runner **breaks** them using an icebreaker with the matching subtype and enough strength, paid for in credits. Any subroutines the Runner doesn't break simply resolve (only ones that literally say "end the run" actually stop the run — the rest are just costs the Runner eats, like taking damage or being taxed credits). [nullsignal.games/players/learn-to-play/run-guide/; unbroken-subroutine nuance corroborated by cryoffrustration.wordpress.com: "Subroutines only end runs if explicitly stating 'end the run'"]
3. If the Runner passes all ice on the server (or the server has none), the run becomes **successful** and the Runner **breaches** the server, gaining **access** to its cards one at a time. [nullsignal.games/players/learn-to-play/run-guide/]
4. **Access** resolves differently depending which server was hit:
   - **HQ** (Corp's hand, as a server): access **1 random card** from the Corp's hand — neither player chooses which. [nullsignal.games learn-to-play-runner; corroborated by ANCUR wiki FAQ and cryoffrustration.wordpress.com "only one card is accessed"]
   - **R&D** (Corp's deck, as a server): access the **top card** of the deck.
   - **Archives** (Corp's discard pile, as a server): access **every card** currently in Archives (face-up ones the Runner already saw when trashed, plus face-down ones turned face-up for this access), one at a time, in whatever order the Runner chooses. [nullsignal.games learn-to-play-runner; Archives ordering corroborated by the ANCUR wiki FAQ]
   - Remote servers: access whatever single asset/agenda (plus any upgrades) is installed there.
   - **What happens per card type on access**: an **agenda is stolen automatically** (no cost, no choice — straight into the Runner's score area); an **asset or upgrade** may optionally be trashed by paying its printed trash cost; an **operation or a piece of ice** encountered this way is just revealed/seen, with no further interaction (they're never trash-able via access). [nullsignal.games learn-to-play-runner; corroborated in detail by cryoffrustration.wordpress.com "Remotes"/"Running" sections]
5. The Runner may voluntarily **jack out** (abandon the run) during the movement phase between ice, but not in the middle of resolving an ice encounter they're already committed to.

Runner wins are not exclusively about stealing agendas directly — trashing key Corp assets/upgrades, draining Corp credits, and forcing extra Corp draws (pushing toward a Corp deck-out) are all legitimate parts of the Runner's game plan. [synthesis; deck-out point per §2 above]

---

## 6. Core vocabulary (plain English)

| Term | Plain-English meaning |
|---|---|
| **Click** | The basic unit of "doing a thing" on your turn. Corp gets 3/turn, Runner gets 4/turn. |
| **Credit** | The game's money. Spent to install cards, rez cards, boost strength in fights, etc. |
| **Server** | A "place" the Corp can be attacked. Three fixed **central servers** every game (HQ = hand, R&D = deck, Archives = discard pile) plus any number of Corp-created **remote servers**, each usually built to hold one asset/agenda behind some ice. |
| **Ice** | Security software the Corp installs to protect a server. Sits between the Runner and the server's contents. Must be dealt with during a run to get past it. Main types: **barrier** (usually just blocks passage), **sentry** (usually damages the Runner), **code gate** (usually taxes the Runner's credits). |
| **Rez** | Paying a card's rez cost to flip it face-up and turn on its effects. Ice can only be rezzed while being approached in a run; other cards (assets/upgrades) can be rezzed whenever the Corp likes. Costs credits, never a click. |
| **Install** | Putting a card into play from hand, paying its install cost. For the Corp, most things install face-down (unrezzed); for the Runner, things install face-up immediately. |
| **Run** | The Runner's attempt to break into a specific server, from declaring the target through to the run ending (successfully or not). |
| **Approach / Encounter** | Sub-steps of a run: the Runner *approaches* each piece of ice in turn (the Corp's chance to rez it); if rezzed, the Runner then *encounters* it and deals with its subroutines. |
| **Subroutine** | A numbered, automatic effect printed on a piece of ice. Fires unless the Runner breaks it. |
| **Break (a subroutine) / Icebreaker** | Using a matching icebreaker program (paying credits, sometimes needing to boost its strength first) to cancel a subroutine instead of letting it resolve. |
| **Breach / Access** | Once the Runner gets past all of a server's ice, they *breach* it and *access* its cards — the step where they actually see/interact with what's inside. |
| **Steal** | What happens automatically when the Runner accesses an agenda — no cost, straight into their score area. |
| **Trash** | Discarding a card out of play, permanently, into Archives (Corp) or the Heap (Runner). Runners pay a card's printed trash cost to trash Corp assets/upgrades on access; the Corp can trash Runner resources under specific conditions (see **tag**). |
| **Tag** | A marker placed on the Runner by certain card effects. While tagged, the Corp gains extra options (e.g., spending a click + 2 credits to force-trash a Runner resource). The Runner can spend a click + 2 credits to remove one tag. |
| **Trace** | A contest: the Corp reveals a base trace strength and may spend credits to raise it; the Runner then spends credits to raise their **link**; if the final trace strength is higher, the trace succeeds and triggers an effect (often giving a tag). |
| **Link** | The Runner's built-in resistance to traces (from their identity card and any link-boosting cards), before spending credits in the trace itself. |
| **Net damage / meat damage / brain damage** | Ways the Runner is forced to discard cards at random from hand. Net and meat damage just cost cards; brain damage additionally and *permanently* shrinks the Runner's maximum hand size by one each time it happens. |
| **Flatline** | The Runner loses instantly because they were forced to discard a card from hand but had none left. |
| **Deck out** | The Corp loses instantly because they were forced to draw from an empty R&D. |
| **Agenda point** | The win-condition currency; first to 7 (6 in the teaching game) wins. |
| **Identity / Faction / Influence** | Every deck is built around one **identity** card, which fixes the deck's **faction** (e.g. Runner: Shaper/Criminal/Anarch; Corp: e.g. Weyland/NBN/Jinteki/Haas-Bioroid), its minimum deck size, and its **influence** limit — a budget for how many "off-faction" cards can be splashed in. |
| **Rig / Grip / Heap / Stack** | Runner-side terms: **rig** = your installed cards in play, **grip** = your hand, **heap** = your discard pile, **stack** = your deck. |

[Table synthesized from nullsignal.games learn-to-play-corp/-runner and run-guide pages, corroborated where noted by the ANCUR unofficial-rules wiki, UltraBoardGames' "Traces and Tags" page, and cryoffrustration.wordpress.com's newbie-mistakes rundown. Trace/link mechanics specifically: the step-by-step wording ("Corp spends credits first, then Runner spends to raise link, then compare") is sourced from older FFG-era community pages (ANCUR wiki, UltraBoardGames) rather than a verbatim quote of NSG's current Comprehensive Rules text — a direct fetch of `rules.nullsignal.games` this session confirmed the *current* rules still have distinct "Link" (§10.7) and "Trace" (§10.8) sections in the same conceptual shape, but the page's length prevented pulling the exact current wording. Treat the mechanical shape as solid, the precise phrasing as unconfirmed-current.]

---

## 7. Light note on archetype-level strategic patterns

This section is intentionally brief — flavor/context, not core reference. Sourced from community strategy writing rather than official NSG material, so treat it as broadly-accepted community shorthand rather than official terminology.

- **Corp archetypes** are commonly bucketed into three broad shapes, frequently hybridized: **rush** (score agendas fast behind minimal but "end the run"-heavy ice, before the Runner's rig comes online, sometimes paired with a damage/kill backup plan), **glacier** (a slower plan built around stacking heavy, expensive ice on key servers so every run is individually costly, only scoring once board state is secure), and **kill/prison** (built to win via flatlining the Runner or otherwise locking them out of acting, agenda-scoring being secondary). [WebSearch summary of community sources including StimHack's "The Four Corps you Meet in Netrunner"]
- **Runner faction flavor** (general community characterization, light-touch and not verified against current card pool specifics): **Criminal** decks tend toward efficient, stealthy, economical play, picking off exactly what's needed with tools like tutoring for a key breaker; **Shaper** decks tend toward flexible "toolbox" play, assembling a broad, adaptable rig and tutoring for whatever the situation calls for; **Anarch** decks tend toward aggressive, virus-based, disruptive play, often trading card/resource efficiency for raw pressure on the Corp. [WebSearch summary of community discussion; not independently verified against a single authoritative source this session]

---

## 8. Sources

- Null Signal Games — [Learn to Play hub](https://nullsignal.games/players/learn-to-play/), [Learn to Play: Corp](https://nullsignal.games/players/learn-to-play/learn-to-play-corp/), [Learn to Play: Runner](https://nullsignal.games/players/learn-to-play/learn-to-play-runner/), [Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/), [Rules hub](https://nullsignal.games/rules/), [Supported Formats](https://nullsignal.games/players/supported-formats/) — directly fetched this session; primary source for turn structure, click counts, install/rez/score mechanics, run phases, access resolution.
- [rules.nullsignal.games](https://rules.nullsignal.games/) (NSG Comprehensive Rules, v25.08/v26.03) — directly fetched; confirmed current click/credit/rez/install definitions and the continued existence of distinct Link/Trace sections, but the document's length meant several deep sections (full Tags/Trace text) could not be pulled verbatim this session.
- [ANCUR — Android Netrunner Comprehensive Unofficial Rules Wiki (Fandom)](https://ancur.fandom.com/wiki/) — FFG-era community wiki, used via search snippets for trace/tag/damage mechanics and win-condition detail; corroborated against NSG sources where possible.
- [UltraBoardGames — Traces and Tags in Android: Netrunner](https://www.ultraboardgames.com/android-netrunner/traces-and-tags.php) — used for trace step-by-step detail.
- [cryoffrustration.wordpress.com — "The #$#!! Compendium of Netrunner Newbie Mistakes"](https://cryoffrustration.wordpress.com/2017/07/09/netrunner-newbie-mistakes/) — community-written, extensively used for granular rule corrections new players commonly get wrong.
- [StimHack — New Players hub](https://stimhack.com/new-players/), [Teaching Netrunner: Part 1](https://stimhack.com/teaching-netrunner-part-1/), [The Four Corps you Meet in Netrunner](https://stimhack.com/the-four-corps-you-meet-in-netrunner-by-erinrockabitch/) — community strategy site; used for teaching-methodology framing and archetype flavor.
- WebSearch snippets (not independently fetched in full) contributed corroborating detail on: click counts, deck-size/influence structure (System Gateway identities), Corp/Runner faction archetype characterization, and ice-bluffing strategy (via Strange Assembly's "The Big Book of Bluffing," title only, not fetched).
