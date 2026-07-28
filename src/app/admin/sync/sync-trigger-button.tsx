"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Client component: POSTs to the admin sync API route, then refreshes the
// server-rendered page so the updated SyncRun row shows up. Deliberately
// unstyled (functional only) per PHASE_2_PLAN.md's scope for this page.
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
    <div>
      <button onClick={trigger} disabled={pending}>
        {pending ? "Syncing..." : "Trigger"}
      </button>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}
    </div>
  );
}
