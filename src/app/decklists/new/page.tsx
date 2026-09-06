import Link from "next/link";
import { redirect } from "next/navigation";

import { createDecklist } from "@/app/actions/decklists";
import { formatCode } from "@/lib/format";
import { listIdentityCards } from "@/lib/identity-cards";

import { auth } from "../../../../auth";

export const dynamic = "force-dynamic";

export default async function NewDecklistPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const identities = await listIdentityCards();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New decklist</h1>
        <Link href="/me" className="text-sm underline">
          Back to my decks
        </Link>
      </div>

      <form action={createDecklist} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            name="name"
            required
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Identity
          <select
            name="identityCode"
            required
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            defaultValue=""
          >
            <option value="" disabled>
              Select identity
            </option>
            {identities.map((card) => (
              <option key={card.code} value={card.code}>
                {card.title} ({formatCode(card.factionCode)})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-start rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Create
        </button>
      </form>
    </main>
  );
}
