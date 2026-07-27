# Agent instructions for this repo

## Plans

Build plans live in `plans/`. Each plan describes the scope of one build step (e.g. `plans/PHASE_1_PLAN.md`) — build only what's in scope for the plan you were given; anything explicitly listed as deferred belongs to a future plan, not yours.

## Task reports

After completing work on a plan, always write a task report as a Markdown file under `agent-reports/`, named after the plan (e.g. `plans/PHASE_1_PLAN.md` → `agent-reports/phase-1.md`). Do not skip this even if the work seems self-explanatory from the diff.

The report should cover:
- What was actually built, file by file or area by area.
- Any deviations from the plan, and why.
- The verification steps from the plan's "Verification" section, and their actual results (commands run, output, pass/fail) — not just "should work."
- Anything left unresolved, follow-ups, or open questions for the next phase.
