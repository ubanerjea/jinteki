# Netrunner New-Player FAQ — for jinteki's future FAQ feature

## 1. Purpose and scope

A collection of genuinely common new-player questions and plain-English answers, meant as raw material for an eventual in-app FAQ feature sitting alongside jinteki's card/rulings/rules-section browser. Questions are pulled from what community sources actually flag as common points of confusion (principally a dedicated newbie-mistakes retrospective and NSG's own official learn-to-play material), not invented from scratch. Each entry notes the **Report-1 vocabulary term(s)** it relates to (see `netrunner-play-patterns.md`) and its source. Where an answer synthesizes across sources or leans on general knowledge to fill a small gap, that's flagged explicitly.

---

## 2. Running and ice

### Q: What actually happens, step by step, when I "run" a server?
A run has a defined sequence: **(1) Initiation** — you declare which server you're attacking. If it has no ice, skip to breach. **(2) Approach** — you approach the outermost (or next) piece of ice; this is the Corp's one window to rez it if it's still unrezzed. **(3) Encounter** — if the ice is rezzed, you now deal with its subroutines: use icebreakers to break as many as you want/can afford, and any you don't break simply resolve. **(4) Movement** — having passed that ice, you can voluntarily jack out (abandon the run) or continue to the next ice / the server itself. Steps 2–4 repeat per piece of ice. **(5) Success/Breach** — once you've passed all ice, the run is successful and you breach the server, gaining access to its contents one card at a time. **(6) Run ends.**
*Related terms: run, approach, encounter, subroutine, breach, access, jack out.*
**Source**: [nullsignal.games Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/) (directly quoted phase names and mechanics).

### Q: Do I have to break every subroutine on a piece of ice?
A: No. You choose which subroutines to break (if you have the credits/breaker capacity); any you leave unbroken simply resolve. Critically, **most subroutines don't end the run** — only ones whose text literally says "end the run" do that. A subroutine might instead deal damage, cost you credits, give you a tag, etc. — annoying, but survivable, and sometimes worth eating on purpose if breaking it isn't worth the cost.
*Related terms: subroutine, break, ice.*
**Source**: [cryoffrustration.wordpress.com newbie-mistakes list](https://cryoffrustration.wordpress.com/2017/07/09/netrunner-newbie-mistakes/), "Running" section: "Subroutines only end runs if explicitly stating 'end the run'."

### Q: Does breaking ice destroy it, or turn it back off (derez it)?
A: No to both. Breaking a subroutine just cancels that one effect for this encounter — the ice card itself is completely unaffected structurally, stays rezzed, and will need to be dealt with again in full on your next run at that server. Icebreaker strength/break progress also doesn't carry over between encounters by default; each new encounter starts fresh unless a specific card says otherwise.
*Related terms: ice, rez, break, icebreaker.*
**Source**: cryoffrustration.wordpress.com, "Running" section: "Breaking ICE doesn't trash or derez it"; "Icebreakers DON'T keep their strength for the whole of the run."

### Q: Can I back out of a run once it's started?
A: Yes, via **jack out** — but only during the movement window between ice, not in the middle of an ice encounter you're already resolving. Once you're committed to encountering a rezzed piece of ice, you have to deal with its subroutines before you get another chance to retreat.
*Related terms: run, jack out, encounter.*
**Source**: [nullsignal.games Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/); corroborated by cryoffrustration.wordpress.com "Jack Out Timing: Jacking out is impossible after encountering rezzed ICE."

### Q: I passed a piece of ice without it being rezzed — was that "free"? Can the Corp rez it later?
A: The Corp's only chance to rez a given piece of ice is *while you're approaching that specific ice*. If they decline (or can't afford it), that ice stays unrezzed for the rest of this run and you pass it with no effect — but it's still there, face-down, for your *next* run at that server, when the Corp gets another rez window. This is also the heart of Corp bluffing: choosing not to rez something (or being unable to) doesn't reveal what it is.
*Related terms: rez, approach, ice.*
**Source**: [nullsignal.games Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/): "The only time the Corp can rez a piece of ice is while the Runner is approaching that ice."

### Q: Do I need a different icebreaker for every piece of ice?
A: Not one-per-card, but you generally need one breaker *per ice type you expect to face*: **fracters** break barriers, **decoders** break code gates, **killers** break sentries. A single breaker of the right type can be used repeatedly against any ice of that type (as long as you can afford to boost its strength to match and pay its per-subroutine break cost). **AI breakers** are a workaround that can interact with any ice type regardless of subtype, typically at a cost (e.g., being less efficient, or trashing themselves after use).
*Related terms: icebreaker, ice, break.*
**Source**: [nullsignal.games Learn to Play: Runner](https://nullsignal.games/players/learn-to-play/learn-to-play-runner/).

---

## 3. Access

### Q: What actually happens when I "access" a card?
A: It depends entirely on the card type. **Agenda** → stolen automatically, no cost, straight into your score area. **Asset or upgrade** → you *may* pay its printed trash cost to trash it (your choice — you're never forced to). **Operation or ice** encountered via access (e.g., found in Archives or on top of R&D) → just revealed to you, no interaction possible; you can't steal or trash those via access.
*Related terms: access, steal, trash.*
**Source**: [nullsignal.games Learn to Play: Runner](https://nullsignal.games/players/learn-to-play/learn-to-play-runner/); corroborated by cryoffrustration.wordpress.com "Remotes" section (untrashable card types) and ANCUR wiki.

### Q: What's the actual difference between a "run" and "access"? People use them like they mean the same thing.
A: A **run** is the whole attempt — from declaring a target server through however many ice encounters it takes to get there. **Access** is specifically the last step: once you've successfully breached the server, access is the act of actually looking at / interacting with the card(s) inside it. You can run and not access anything (if the run fails/you jack out before breaching); you only ever access as the payoff of a *successful* run.
*Related terms: run, breach, access.*
**Source**: [nullsignal.games Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/) — phase breakdown makes the run/access distinction explicit.

### Q: When I access HQ, do I see the Corp's whole hand and pick what I want?
A: No — a very common misconception. Accessing HQ gets you exactly **one random card** from the Corp's hand, chosen at random (not by either player). Same idea for R&D: you access the single top card of the deck, not a choice from several.
*Related terms: access, server (HQ/R&D).*
**Source**: cryoffrustration.wordpress.com, "Basics" section: "HQ Access: ...don't show them your whole hand and let them choose one" — only one card, randomly.

### Q: If I run Archives, do I get to see and pick through everything that's ever been trashed?
A: Yes, with a nuance: all cards currently in Archives are accessed. Cards that were trashed **face-up in front of you** (you saw them get trashed) you already know; cards trashed **face-down** get turned face-up as part of this access. You then access/resolve each card one at a time, **in whatever order you choose**.
*Related terms: access, server (Archives), trash.*
**Source**: WebSearch summary of the ANCUR Fandom wiki FAQ: "When accessing cards in Archives, the Runner turns all cards faceup in Archives before accessing them, then accesses and resolves individual cards one by one, in any order he wants."

---

## 4. Tags and traces

### Q: What is a "tag" and why should I care about having one?
A: A tag is a marker placed on the Runner by certain card/ability effects (often via a successful trace — see next question). While you have at least one tag, you're "tagged," which unlocks extra options for the Corp — most commonly, spending a click + 2 credits to force you to trash one of your own resources. Some especially punishing cards only work against a tagged Runner at all. Tags don't clear themselves at end of turn; you have to spend a click + 2 credits yourself to remove one.
*Related terms: tag, trash, click, credit.*
**Source**: WebSearch synthesis of the ANCUR Fandom wiki and community summaries, corroborated by [nullsignal.games Learn to Play](https://nullsignal.games/players/learn-to-play/) pages for the general tag/trash relationship. Exact current wording of NSG's Comprehensive Rules §10.5 was not obtainable verbatim this session (page too long to fetch in full) — the mechanical shape described here is corroborated across multiple community sources but not directly quoted from the current rules text.

### Q: What is a "trace" and how do I know if it succeeds?
A: A trace is a credit-spending contest triggered by a card effect. The named card gives a **base trace strength**; the Corp may then spend any number of credits to raise that strength further. The Runner responds by spending credits to raise their own **link** (starting from their identity's base link plus any link-boosting cards already installed). Compare the two: if the Corp's final trace strength is *higher* than the Runner's final link, the trace **succeeds** and its "if successful" effect happens (often: give the Runner a tag). If the Runner's link is equal to or higher, the trace **fails** — ties favor the Runner.
*Related terms: trace, link, tag, credit.*
**Source**: WebSearch synthesis of [UltraBoardGames' "Traces and Tags"](https://www.ultraboardgames.com/android-netrunner/traces-and-tags.php) and the ANCUR Fandom wiki (both FFG-era community references). A direct fetch of NSG's current Comprehensive Rules confirmed the game still has distinct **Link** (§10.7) and **Trace** (§10.8, including a "Steps of Resolving a Trace Attempt" subsection) — i.e., the mechanic's existence and general shape is confirmed current, but the exact modern step-by-step wording could not be pulled verbatim this session due to the document's length. Treat the mechanical shape above as reliable, the precise phrasing as carried over from older sources.

---

## 5. Damage and losing

### Q: What's the difference between net damage, meat damage, and brain damage — don't they all just make me discard cards?
A: All three force you to trash cards at random from your hand (grip) immediately — in that sense they're the same. The difference is **brain damage** also **permanently** reduces your maximum hand size by one, every single time it happens, forever (net and meat damage don't). A Runner who's taken several brain damage hits over a game is playing with a permanently smaller hand for the rest of that game.
*Related terms: net damage, meat damage, brain damage, grip.*
**Source**: WebSearch synthesis of the ANCUR Fandom wiki's "Brain Damage" and "Damage" pages.

### Q: What actually happens if I run out of cards to discard from damage — do I just discard nothing?
A: No — if you're required to trash a card from your grip and you have none left, you **flatline** and lose the game immediately. This is a real, common way for aggressive "kill" Corp decks to win outright, not just a flavor detail.
*Related terms: flatline, brain damage/net damage/meat damage, grip.*
**Source**: cryoffrustration.wordpress.com, "Losing Conditions" section: "Flatline Threshold: Runners flatline at -1 cards in hand, not 0."

### Q: Does the Runner lose if their deck (the stack) runs out of cards?
A: No — a common assumption carried over from other card games, but wrong here. Running out of cards to draw is not, by itself, a loss condition for the Runner. (It *is* a loss condition for the **Corp** — see the next question — which is one of the game's real asymmetries.)
*Related terms: stack, deck out.*
**Source**: cryoffrustration.wordpress.com, "Losing Conditions" section: "The runner doesn't lose when their deck empties."

### Q: What happens if the Corp has to draw from an empty R&D?
A: The Corp loses immediately. This "deck-out" condition is a real strategic target for the Runner — repeatedly forcing extra Corp draws (some cards do this directly) can be a legitimate win plan on its own, separate from stealing agendas.
*Related terms: deck out, R&D (server).*
**Source**: cryoffrustration.wordpress.com, "Losing Conditions" section: "Corp Loss: The Corp loses when forced to draw from empty R&D, not when R&D becomes empty."

### Q: If I steal my 7th agenda point but that same access would also flatline me, do I still win?
A: Yes. Hitting the agenda-point threshold ends the game immediately, and that precedence is explicit — the game doesn't wait around to apply a simultaneous loss condition against you.
*Related terms: agenda point, flatline.*
**Source**: cryoffrustration.wordpress.com, "Losing Conditions" section: "If a runner steals their 7th agenda point and would be flatlined immediately after, the runner still wins." Corroborated by a WebSearch summary of the ANCUR Fandom wiki FAQ on game-ending precedence.

---

## 6. Corp turn choices and bluffing

### Q: What is the Corp supposed to do on a turn where they're not ready to score anything?
A: Plenty — clicks aren't wasted just because nothing gets scored. A completely normal Corp turn might be entirely: gain credits, install a new piece of ice, rez an asset for ongoing value, or advance a card while holding cards back for information/bluffing reasons. Scoring is the *payoff* action, not the only valid one — most turns across a game are spent setting up rather than scoring.
*Related terms: click, install, rez, advance.*
**Source**: Inferred/general-knowledge synthesis from [nullsignal.games Learn to Play: Corp](https://nullsignal.games/players/learn-to-play/learn-to-play-corp/)'s description of the full basic-action set (gain credits, draw, play operations, install, advance) alongside score being only one of several actions — not a claim directly stated as a standalone FAQ answer in any single fetched source this session, but a straightforward reading of the documented action set.

### Q: Why does the Corp install things face-down instead of just playing them normally? Isn't that just hiding information for no reason?
A: It's a deliberate core mechanic, not an oversight. Installing face-down (**unrezzed**) means the Runner can't tell from the board alone whether a given remote server holds an agenda, an asset, or an ice trap designed to punish a run — they have to actually run it (or wait for/force a rez) to find out. This is where **bluffing** lives: a Corp might leave an affordable, useful ice unrezzed and let the Runner guess wrong about what it is, or install a server that *looks* like an agenda to bait a run into a trap. Reading the Corp's rez timing, credit counts, and install patterns for tells is a whole skill area in the game.
*Related terms: install, rez, unrezzed, server.*
**Source**: WebSearch synthesis of a community strategy article (Strange Assembly, "The Big Book of Bluffing" — title and general thesis found via search, not fetched in full) plus corroborating framing from [nullsignal.games Learn to Play: Corp](https://nullsignal.games/players/learn-to-play/learn-to-play-corp/) on face-down installation. The specific illustrative example (choosing not to rez a cheaper ice to disguise it as a more expensive one) comes from the WebSearch summary of that Strange Assembly article and is flagged as community strategy commentary, not official rules text.

### Q: Does rezzing a card cost a click, same as installing it?
A: No — this trips people up because install *does* cost a click (plus credits), but rez is credits-only, at instant speed, whenever the Corp is allowed to do it (any time for most cards; only during the approach window for ice). Similarly, scoring an agenda that's ready costs no click either.
*Related terms: install, rez, click, score.*
**Source**: cryoffrustration.wordpress.com: "Rezzing cost: Rezzing costs no clicks, only installing does"; "Scoring agendas DOESN'T cost a click and happens at instant speed."

---

## 7. Deckbuilding

### Q: Why can't I just put any card I want in my deck? What's "influence"?
A: Every deck is built around one **identity** card, which locks the deck to one **faction** (e.g., Runner: Shaper/Criminal/Anarch) and sets two hard numbers: a **minimum deck size** and an **influence limit**. Cards from your own faction are free to include in any quantity the deck-size math allows. Cards from *other* factions ("splashes") each carry an influence cost (shown as pips on the card, 0–5), and the total influence spent across all off-faction cards in your deck can't exceed your identity's influence limit. Some off-faction cards have no influence value at all printed, meaning they cannot legally be splashed regardless of budget — different from having an influence cost of 0.
*Related terms: identity, faction, influence.*
**Source**: WebSearch synthesis of NSG's current Comprehensive Rules content (via search snippets — direct verbatim section text not obtained this session): "Each player's deck is associated with a single identity card that determines the faction, minimum deck size, and influence limit of that deck... A card's influence cost is represented in a bar with 5 circular slots... Some cards cannot be played out of faction, and therefore do not have an influence value, which is different from an influence cost of '0.'"

### Q: Why do different decks/identities have different minimum deck sizes? Isn't there just one deck size like in other card games?
A: Unlike, say, a fixed 60-card minimum, Netrunner's minimum deck size is printed per-identity and can vary. As of the current Standard-legal card pool, the System Gateway–era identities all use a **40-card minimum / 15 influence** structure. Separately, System Gateway also includes two **teaching identities** (used only in the scripted learn-to-play decks, not for real constructed play) with a smaller **30-card minimum and no influence system at all** — simplified specifically to keep a first game approachable.
*Related terms: identity, minimum deck size, influence.*
**Source**: WebSearch summary citing [nullsignal.games's Getting Started: Sample Decklists](https://nullsignal.games/players/getting-started-sample-decklists/) and community deckbuilding commentary: "All seven of the Standard-legal identities in System Gateway – Remastered Edition follow the same 40/15 structure... The teaching identities contained in the Starter Decks... have a minimum deck size of 30 cards and ignore influence limits." Not independently verified against a directly-fetched primary page this session — flagged as search-snippet-sourced.

---

## 8. Terminology confusion

### Q: People keep saying "grip," "heap," and "stack" — are those just fancy words for hand/discard/deck?
A: Yes, essentially — they're the game's flavor terms for the Runner's zones specifically: **grip** = hand, **heap** = discard pile, **stack** = deck. The Corp's equivalent zones use different, non-flavor names instead: **HQ** = hand, **Archives** = discard pile, **R&D** = deck. New-player teaching advice explicitly recommends not leading with this jargon — introduce the plain-English concept first ("the deck," "the discard pile") and let the flavor terms come up naturally as they're needed.
*Related terms: grip, heap, stack, HQ, Archives, R&D.*
**Source**: [StimHack, Teaching Netrunner: Part 1](https://stimhack.com/teaching-netrunner-part-1/): "What's the difference between the grip and heap? Where are the Archives?... avoid using jargon at first, instead referring to R&D as 'the deck' and clicks as actions etc."

### Q: What's the difference between "rez" and "install" — people use them almost interchangeably and it's confusing.
A: They're two separate steps for Corp cards specifically. **Install** = paying to put the card into play at all (for most Corp cards, this puts it in face-down/unrezzed). **Rez** = separately paying to flip an already-installed card face-up and turn its effects/abilities on. A card can sit installed-but-unrezzed for many turns. (Runner cards, by contrast, install face-up immediately — there's no separate rez step on the Runner side, which is part of why the terms get blurred by people used to only one side.)
*Related terms: install, rez, unrezzed.*
**Source**: Synthesis of [nullsignal.games Learn to Play: Corp](https://nullsignal.games/players/learn-to-play/learn-to-play-corp/) and cryoffrustration.wordpress.com's cost-type breakdown ("Corp Installation: Corp cards install facedown and only cost credits when rezzed, not installed").

### Q: Is "approaching" ice the same thing as "encountering" it?
A: No, they're consecutive but distinct steps of a run. You **approach** a piece of ice first — this is purely the moment the Corp can choose to rez it. Only if it's actually rezzed do you then **encounter** it, which is the step where its subroutines are actually in play and you're deciding what to break. If the Corp doesn't rez during approach, you skip straight past — there's no encounter step for unrezzed ice.
*Related terms: approach, encounter, rez, subroutine.*
**Source**: [nullsignal.games Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/), which names these as separate, ordered phases.

---

## 9. Sources

- Null Signal Games — [Learn to Play: Corp](https://nullsignal.games/players/learn-to-play/learn-to-play-corp/), [Learn to Play: Runner](https://nullsignal.games/players/learn-to-play/learn-to-play-runner/), [Run Guide](https://nullsignal.games/players/learn-to-play/run-guide/), [Getting Started: Sample Decklists](https://nullsignal.games/players/getting-started-sample-decklists/) — directly fetched this session; official primary source for run phases, install/rez distinctions, and basic action sets.
- [rules.nullsignal.games](https://rules.nullsignal.games/) (NSG Comprehensive Rules) — directly fetched; confirmed current existence/structure of Tags (§10.5) and Link/Trace (§10.7–10.8) sections and core term definitions (click, credit, rez, install, trash), but the document's length prevented pulling full verbatim text of every section referenced here — flagged per-answer above wherever this applies.
- [cryoffrustration.wordpress.com — "The #$#!! Compendium of Netrunner Newbie Mistakes"](https://cryoffrustration.wordpress.com/2017/07/09/netrunner-newbie-mistakes/) — the single richest source for genuinely common new-player misconceptions; directly fetched and extensively quoted throughout this report.
- [StimHack — Teaching Netrunner: Part 1](https://stimhack.com/teaching-netrunner-part-1/), [New Players hub](https://stimhack.com/new-players/) — directly fetched/searched; used for terminology-confusion framing and teaching-methodology commentary.
- [ANCUR — Android Netrunner Comprehensive Unofficial Rules Wiki (Fandom)](https://ancur.fandom.com/wiki/) and [UltraBoardGames — Traces and Tags](https://www.ultraboardgames.com/android-netrunner/traces-and-tags.php) — FFG-era community references, used via WebSearch snippets (not directly fetched) for trace/tag/damage/access mechanics; corroborated against current NSG sources where a current source was available, flagged where it wasn't.
- Strange Assembly, "The Big Book of Bluffing" — found via WebSearch (title/thesis only, not fetched in full); used only for the Corp-bluffing FAQ answer, flagged as community strategy commentary rather than rules text.

**General caveat**: this FAQ set favors breadth of genuinely-documented common confusions over exhaustiveness. It is not a substitute for jinteki's existing per-card rulings or the comprehensive rule-section reference — it's meant to sit above both as a plain-English first stop.
