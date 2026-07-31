"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Client component: POSTs to the admin sync API route, then refreshes the
// server-rendered page so the updated SyncRun row shows up. Restyled in
// Phase 5 to match the rest of the app's Tailwind conventions (the
// functionality itself is unchanged from Phase 2).
export function SyncTriggerButton({ urlType }: { urlType: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sync/${urlType}`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed with status ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={trigger}
        disabled={pending}
        className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
      >
        {pending ? "Syncing..." : "Trigger"}
      </button>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
