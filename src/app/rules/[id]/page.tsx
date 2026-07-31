import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Same URL as src/sync/sync-rules.ts's RULES_URL - duplicated as a plain
// constant here rather than importing that module, since sync-rules.ts
// pulls in cheerio (a scraping dependency with no reason to end up in this
// page's server bundle).
const RULES_URL = "https://rules.nullsignal.games/";

export default async function RuleSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const section = await prisma.ruleSection.findUnique({ where: { id } });

  if (!section) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/rules" className="text-sm underline">
          Back to Rules
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">
          {section.id} {section.title}
        </h1>
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {section.bodyText}
        </p>
        <a
          href={`${RULES_URL}#${section.anchor}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
        >
          View on rules.nullsignal.games (canonical, most-current wording)
        </a>
      </div>
    </main>
  );
}
