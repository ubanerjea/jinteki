"use server";

// Allowlist admin Server Actions, per PHASE_9_PLAN.md §3
// (plans/design/REMOTE_ACCESS_DESIGN.md Decision 5's amendment). Plain
// "use server" functions bound directly to <form action={...}> (no client
// JS), following src/app/actions/favorites.ts's Server Actions convention -
// these are simple state toggles, not a long-running job needing a
// fetch+API-route pattern like /admin/sync's trigger button.
//
// Each function opens with requireAdmin() - this is a strictly separate,
// later gate than the AllowedLogin sign-in check in auth.ts: AllowedLogin
// decides "can this GitHub account sign in at all", User.role === "ADMIN"
// decides "what can a signed-in user do" (managing the allowlist itself is
// an admin action, same as triggering an NRDB sync).

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function addAllowedLogin(formData: FormData) {
  await requireAdmin();
  // Lowercased so every row ever written to AllowedLogin is already in the
  // same canonical casing that src/lib/check-allowed-login.ts normalizes to
  // on the read path - GitHub logins are case-insensitive on GitHub's own
  // side, so an admin typing different casing than what OAuth's profile.login
  // actually returns must not create a mismatched, unusable row.
  const githubLogin = String(formData.get("githubLogin") ?? "").trim().toLowerCase();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!githubLogin) throw new Error("GitHub login is required");

  // upsert, not create: re-submitting an existing (possibly deactivated)
  // login reactivates it and updates the note, rather than erroring on the
  // unique constraint.
  await prisma.allowedLogin.upsert({
    where: { githubLogin },
    update: { active: true, note },
    create: { githubLogin, note },
  });

  revalidatePath("/admin/allowlist");
}

export async function setAllowedLoginActive(githubLogin: string, active: boolean) {
  await requireAdmin();
  await prisma.allowedLogin.update({ where: { githubLogin }, data: { active } });
  revalidatePath("/admin/allowlist");
}
