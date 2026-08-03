import Link from "next/link";

import { auth, signOut } from "../../auth";

// Persistent header, added in Phase 5 to close the gap PHASE_5_PLAN.md
// calls out explicitly: "there is currently no sign-in/sign-out control
// anywhere in the app's UI." A server component (reads auth() directly, no
// client-side session fetch needed - matches PHASE_5_PLAN.md's "Global
// navigation & auth state" section).
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium">
          <Link href="/" className="font-semibold tracking-tight">
            jinteki
          </Link>
          <Link href="/cards" className="text-zinc-600 hover:underline dark:text-zinc-300">
            Cards
          </Link>
          <Link
            href="/decklists"
            className="text-zinc-600 hover:underline dark:text-zinc-300"
          >
            Decklists
          </Link>
          <Link href="/rules" className="text-zinc-600 hover:underline dark:text-zinc-300">
            Rules
          </Link>
          <Link href="/formats" className="text-zinc-600 hover:underline dark:text-zinc-300">
            Formats
          </Link>
          {user && (
            <Link
              href="/favorites"
              className="text-zinc-600 hover:underline dark:text-zinc-300"
            >
              Favorites
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link
              href="/admin/sync"
              className="text-zinc-600 hover:underline dark:text-zinc-300"
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              {user.image && (
                // Hotlinked avatar (GitHub's own CDN), same
                // no-next/image-for-hotlinked-images convention as card
                // images (src/app/cards/[code]/page.tsx).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <span className="text-zinc-600 dark:text-zinc-400">
                {user.name ?? user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/api/auth/signin"
              className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
