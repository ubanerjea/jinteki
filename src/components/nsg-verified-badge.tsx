// Ruling.nsgRulesTeamVerified has existed since Phase 1 but, per
// PHASE_5_PLAN.md, "has never been surfaced in any UI" until now. A small
// badge with a one-line tooltip explaining what it means, mirroring
// Scryfall's pattern of a short explainer next to any status a casual user
// wouldn't otherwise intuit.
export function NsgVerifiedBadge() {
  return (
    <span
      title="Reviewed and confirmed by Null Signal Games' official rules team, as opposed to community-sourced Q&A."
      className="ml-2 inline-block shrink-0 cursor-help rounded bg-emerald-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
    >
      NSG-verified
    </span>
  );
}
