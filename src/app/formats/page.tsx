import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// /formats list page (format-descriptions-links-and-search-plan.md §4c).
// Six rows total - no searchParams-driven pagination machinery needed the
// way /cards, /decklists, and /rules all need it for hundreds/thousands of
// rows. Same "list page with a one-line preview linking to a detail page"
// shape /rules/page.tsx already uses for RuleSection, reused here.
export default async function FormatsPage() {
  const formats = await prisma.format.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Formats</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {formats.map((format) => (
          <li key={format.id} className="flex flex-col gap-1 py-3">
            <Link href={`/formats/${format.id}`} className="font-medium underline">
              {format.name}
            </Link>
            {format.description && (
              <p className="line-clamp-2 text-sm text-zinc-500">
                {format.description}
              </p>
            )}
          </li>
        ))}
        {formats.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">No formats found.</li>
        )}
      </ul>
    </main>
  );
}
