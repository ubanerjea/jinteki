import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

import { addAllowedLogin, setAllowedLoginActive } from "@/app/actions/allowlist";

// Admin allowlist UI, per PHASE_9_PLAN.md §3
// (plans/design/REMOTE_ACCESS_DESIGN.md Decision 5's amendment). Follows
// src/app/admin/sync/page.tsx's page-gating shape (server component,
// requireAdmin() in a try/catch rendering inline "Access denied" text on
// failure, same Tailwind table conventions and a badge component for
// Active/Inactive) but uses src/app/actions/allowlist.ts's Server Actions
// (favorites.ts's convention) for mutations, since these are plain state
// toggles rather than a long-running job.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Inactive: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const ALLOWED_STYLES: Record<string, string> = {
  Allowed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Denied: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function StatusBadge({ active }: { active: boolean }) {
  const label = active ? "Active" : "Inactive";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[label]}`}>
      {label}
    </span>
  );
}

function AllowedBadge({ allowed }: { allowed: boolean }) {
  const label = allowed ? "Allowed" : "Denied";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ALLOWED_STYLES[label]}`}>
      {label}
    </span>
  );
}

export default async function AdminAllowlistPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Admin - Allowlist</h1>
        <p className="text-sm text-red-600 dark:text-red-400">
          Access denied: {message}
        </p>
      </main>
    );
  }

  const [allowedLogins, recentAttempts] = await Promise.all([
    prisma.allowedLogin.findMany({ orderBy: { addedAt: "asc" } }),
    prisma.loginAttempt.findMany({ orderBy: { attemptedAt: "desc" }, take: 20 }),
  ]);

  // "Last login" per row - an N+1 query, accepted deliberately at this
  // table's expected size (a handful of rows) per PHASE_9_PLAN.md §3 rather
  // than building a grouped/windowed query for it.
  const lastLogins = await Promise.all(
    allowedLogins.map((entry) =>
      prisma.loginAttempt.findFirst({
        where: { githubLogin: entry.githubLogin, allowed: true },
        orderBy: { attemptedAt: "desc" },
      }),
    ),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin - Allowlist</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <form
        action={addAllowedLogin}
        className="flex flex-wrap items-end gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="githubLogin" className="text-xs font-medium text-zinc-500">
            GitHub login
          </label>
          <input
            id="githubLogin"
            name="githubLogin"
            type="text"
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="text-xs text-zinc-400">case-insensitive — stored lowercase</span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-xs font-medium text-zinc-500">
            Note (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Add
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">GitHub login</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium">Note</th>
              <th className="px-4 py-2 font-medium">Last login</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {allowedLogins.map((entry, i) => {
              const lastLogin = lastLogins[i];
              const toggleAction = setAllowedLoginActive.bind(
                null,
                entry.githubLogin,
                !entry.active,
              );
              return (
                <tr key={entry.githubLogin}>
                  <td className="px-4 py-2 font-medium">{entry.githubLogin}</td>
                  <td className="px-4 py-2">
                    <StatusBadge active={entry.active} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {entry.addedAt.toISOString()}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{entry.note ?? "-"}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {lastLogin?.attemptedAt.toISOString() ?? "never"}
                  </td>
                  <td className="px-4 py-2">
                    <form action={toggleAction}>
                      <button
                        type="submit"
                        className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {entry.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {allowedLogins.length === 0 && (
              <tr>
                <td className="px-4 py-2 text-zinc-500" colSpan={6}>
                  No allowlist entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent sign-in activity</h2>
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">GitHub login</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-2 font-medium">{attempt.githubLogin}</td>
                  <td className="px-4 py-2">
                    <AllowedBadge allowed={attempt.allowed} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {attempt.attemptedAt.toISOString()}
                  </td>
                </tr>
              ))}
              {recentAttempts.length === 0 && (
                <tr>
                  <td className="px-4 py-2 text-zinc-500" colSpan={3}>
                    No sign-in attempts recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
