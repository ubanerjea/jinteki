"use client";

// Shared right-click component every card mention in the app renders
// through (list rows, detail pages, decklist rows, favorites rows) - one
// implementation, not duplicated per page, per PHASE_5_PLAN.md.
//
// Context-menu mechanics are hand-rolled (onContextMenu + preventDefault, a
// fixed-position popover, click-outside-to-close, Escape-to-close) rather
// than pulling in a menu library, per PHASE_5_PLAN.md's "confirm that's
// true before reaching for a menu library" - this turned out to be
// straightforward enough with plain React state + a couple of
// document-level listeners that no library was needed.
//
// Data fetching is a Server Action (getCardReferenceData), called directly
// from the client on right-click - idiomatic for this Next.js version per
// PHASE_5_PLAN.md, no separate REST endpoint.
//
// Known limitation (documented in PHASE_5_PLAN.md's Verification section,
// repeated in agent-reports/phase-5.md): the actual mouse interaction and
// popover positioning/rendering require a real browser with JS execution,
// which isn't available in this build/verification environment. The data
// fetching this component depends on (getCardReferenceData, and the
// rule-section resolution it uses) is verified independently for real -
// see the task report - but the click-to-popover UX itself needs the repo
// owner's manual confirmation in a browser.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  getCardReferenceData,
  type CardReferenceData,
} from "@/app/actions/card-reference";
import { FacetLink } from "@/components/facet-link";
import { NsgVerifiedBadge } from "@/components/nsg-verified-badge";

interface PopoverPosition {
  x: number;
  y: number;
}

export function CardReference({
  code,
  children,
  className,
}: {
  code: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [data, setData] = useState<CardReferenceData | null>(null);
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
    setData(null);
    startTransition(async () => {
      const result = await getCardReferenceData(code);
      setData(result);
    });
  }

  useEffect(() => {
    if (!position) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPosition(null);
    }
    function handlePointerDown(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setPosition(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [position]);

  return (
    <span onContextMenu={handleContextMenu} className={className}>
      {children}
      {position && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: position.y, left: position.x }}
          className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded border border-zinc-300 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">
              {data?.card?.title ?? (isPending ? "Loading..." : code)}
            </span>
            <button
              type="button"
              onClick={() => setPosition(null)}
              aria-label="Close"
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              &times;
            </button>
          </div>

          {isPending && !data && (
            <p className="mt-2 text-zinc-500">Loading card reference...</p>
          )}

          {data?.card && (
            <>
              <p className="mt-1 flex flex-wrap gap-x-1 text-zinc-500">
                <FacetLink kind="faction" value={data.card.factionCode} />
                <span>-</span>
                <FacetLink kind="type" value={data.card.typeCode} />
                <span>-</span>
                <FacetLink kind="side" value={data.card.sideCode} />
              </p>

              {data.card.keywords.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1 text-zinc-500">
                  {data.card.keywords.map((keyword) => (
                    <FacetLink key={keyword} kind="keyword" value={keyword} />
                  ))}
                </p>
              )}

              <Link
                href={`/cards/${data.card.code}`}
                className="mt-1 inline-block text-xs underline"
              >
                Full card page
              </Link>

              <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                <h3 className="font-semibold">Rulings</h3>
                {data.rulings.length === 0 ? (
                  <p className="text-zinc-500">
                    No official rulings for this card.
                  </p>
                ) : (
                  <ul className="mt-1 flex max-h-48 flex-col gap-2 overflow-y-auto">
                    {data.rulings.map((ruling) => (
                      <li key={ruling.id}>
                        {ruling.nsgRulesTeamVerified && <NsgVerifiedBadge />}
                        {ruling.question && (
                          <p className="font-medium">{ruling.question}</p>
                        )}
                        {ruling.answer && <p>{ruling.answer}</p>}
                        {ruling.textRuling && <p>{ruling.textRuling}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                <h3 className="font-semibold">Rules</h3>
                {data.ruleSections.length === 0 ? (
                  <p className="text-zinc-500">
                    No comprehensive-rules section is linked to this card&apos;s
                    type/keywords.
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-2">
                    {data.ruleSections.map((section) => (
                      <li key={section.id}>
                        <Link
                          href={`/rules/${section.id}`}
                          className="font-medium underline"
                        >
                          {section.id} {section.title}
                        </Link>
                        <p className="line-clamp-2 text-zinc-500">
                          {section.bodyText}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {data && data.card === null && (
            <p className="mt-2 text-zinc-500">Card not found.</p>
          )}
        </div>
      )}
    </span>
  );
}
