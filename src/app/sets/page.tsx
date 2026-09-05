import { Prisma } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  formatReleaseDate,
  groupSetsByCycle,
  packSearchHref,
} from "@/lib/sets";

export const dynamic = "force-dynamic";

const CHECKMARK_FORMATS = ["standard", "startup", "eternal"] as const;

async function packCodesInActivePool(
  activeCardPoolId: string,
): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ pack_code: string }[]>(Prisma.sql`
    SELECT DISTINCT jsonb_array_elements_text(raw->'attributes'->'card_set_ids') AS pack_code
    FROM "Card"
    WHERE (raw->'attributes'->'card_pool_ids') @> to_jsonb(${activeCardPoolId}::text)
  `);
  return new Set(rows.map((row) => row.pack_code));
}

function Check({ on }: { on: boolean }) {
  return <span>{on ? "✓" : ""}</span>;
}

export default async function SetsPage() {
  const [packs, cycles, formats] = await Promise.all([
    prisma.pack.findMany(),
    prisma.cycle.findMany(),
    prisma.format.findMany({
      where: { id: { in: [...CHECKMARK_FORMATS] } },
      select: { id: true, activeCardPoolId: true },
    }),
  ]);

  const poolByFormat = new Map<string, Set<string>>();
  await Promise.all(
    formats.map(async (format) => {
      if (!format.activeCardPoolId) {
        poolByFormat.set(format.id, new Set());
        return;
      }
      poolByFormat.set(
        format.id,
        await packCodesInActivePool(format.activeCardPoolId),
      );
    }),
  );

  const grouped = groupSetsByCycle(packs, cycles);

  function setInFormat(code: string, formatId: string): boolean {
    return poolByFormat.get(formatId)?.has(code) ?? false;
  }

  function cycleInFormat(codes: string[], formatId: string): boolean {
    return codes.some((code) => setInFormat(code, formatId));
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sets</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Name</th>
              <th className="py-1.5 pr-3 font-medium">Cards</th>
              <th className="py-1.5 pr-3 font-medium">Release Date</th>
              <th className="py-1.5 pr-3 font-medium">Standard</th>
              <th className="py-1.5 pr-3 font-medium">Startup</th>
              <th className="py-1.5 font-medium">Eternal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {grouped.map((row) =>
              row.kind === "cycle" ? (
                <CycleBlock
                  key={row.id}
                  name={row.name}
                  size={row.size}
                  dateRelease={row.dateRelease}
                  packs={row.packs}
                  setInFormat={setInFormat}
                  cycleInFormat={cycleInFormat}
                />
              ) : (
                <SetRow
                  key={row.pack.code}
                  code={row.pack.code}
                  name={row.pack.name}
                  size={row.pack.size}
                  dateRelease={row.pack.dateRelease}
                  indent={false}
                  setInFormat={setInFormat}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function CycleBlock({
  name,
  size,
  dateRelease,
  packs,
  setInFormat,
  cycleInFormat,
}: {
  name: string;
  size: number;
  dateRelease: Date | null;
  packs: { code: string; name: string; size: number | null; dateRelease: Date | null }[];
  setInFormat: (code: string, formatId: string) => boolean;
  cycleInFormat: (codes: string[], formatId: string) => boolean;
}) {
  const codes = packs.map((p) => p.code);
  return (
    <>
      <tr className="font-medium">
        <td className="py-1.5 pr-3">
          <Link href={packSearchHref(codes)} className="underline">
            {name}
          </Link>
        </td>
        <td className="py-1.5 pr-3">{size}</td>
        <td className="py-1.5 pr-3">{formatReleaseDate(dateRelease)}</td>
        <td className="py-1.5 pr-3">
          <Check on={cycleInFormat(codes, "standard")} />
        </td>
        <td className="py-1.5 pr-3">
          <Check on={cycleInFormat(codes, "startup")} />
        </td>
        <td className="py-1.5">
          <Check on={cycleInFormat(codes, "eternal")} />
        </td>
      </tr>
      {packs.map((pack) => (
        <SetRow
          key={pack.code}
          code={pack.code}
          name={pack.name}
          size={pack.size}
          dateRelease={pack.dateRelease}
          indent
          setInFormat={setInFormat}
        />
      ))}
    </>
  );
}

function SetRow({
  code,
  name,
  size,
  dateRelease,
  indent,
  setInFormat,
}: {
  code: string;
  name: string;
  size: number | null;
  dateRelease: Date | null;
  indent: boolean;
  setInFormat: (code: string, formatId: string) => boolean;
}) {
  return (
    <tr>
      <td className={`py-1.5 pr-3 ${indent ? "pl-6" : ""}`}>
        <Link href={packSearchHref([code])} className="underline">
          {name}
        </Link>
      </td>
      <td className="py-1.5 pr-3">{size ?? ""}</td>
      <td className="py-1.5 pr-3">{formatReleaseDate(dateRelease)}</td>
      <td className="py-1.5 pr-3">
        <Check on={setInFormat(code, "standard")} />
      </td>
      <td className="py-1.5 pr-3">
        <Check on={setInFormat(code, "startup")} />
      </td>
      <td className="py-1.5">
        <Check on={setInFormat(code, "eternal")} />
      </td>
    </tr>
  );
}
