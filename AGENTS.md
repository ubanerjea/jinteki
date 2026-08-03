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

## Workflow: research → vet → build → verify

For a new phase or a substantial update to one, work proceeds as a chain of separate subagents with the orchestrating session (not a subagent) sitting between each handoff:

1. **Research subagent** investigates a question (external UX/domain research, or an internal "how does X actually work today" investigation) and writes findings to `agent-reports/`.
2. **The orchestrating session vets that research** before anything is built from it — see `RESEARCH_AND_VERIFICATION_PRINCIPLES.md` for how. A recommendation only becomes buildable scope once it survives this pass.
3. **Build subagent** builds against a plan doc (`plans/PHASE_N_PLAN.md`) or a vetted research/recommendations report, following it as the authoritative spec.
4. **The orchestrating session writes a verification strategy** for that specific build — concrete commands and concrete expected values, not "should work." Same reference doc.
5. **Verify subagent** — a *separate* agent from the one that built it — independently re-derives every check from scratch, treating the build's own self-reported verification as a hypothesis to re-check, not a given.
6. **Iterate**: if verification fails, a build subagent fixes the specific failures, then a fresh verify subagent runs again. Repeat until it genuinely passes.

Not every change needs the full weight of this chain — a small, contained fix (a CSS tweak, a one-line bug fix) doesn't need a research pass or a dedicated verify subagent, the same way this project has always scaled plan docs down for small work. Use judgment on how much of the chain a given task actually warrants; the point is the chain is available and expected for anything phase-sized, not that every step is mandatory every time.
