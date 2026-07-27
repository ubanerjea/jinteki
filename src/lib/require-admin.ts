import { auth } from "../../auth";

// Session + role check for gating admin-only actions (e.g. triggering syncs).
//
// Phase 1 note: nothing calls this yet - no admin routes/pages exist in this
// phase (sync scripts, moderation, and admin UI are all later phases). This
// helper is written now so those later phases have a ready-made gate to wire
// up, per PHASE_1_PLAN.md.
//
// Promoting the first admin: there's no in-app role-granting UI (also later
// phase - there's only one user to promote right now anyway). Do it with a
// one-off direct DB update once you've signed in once via GitHub, e.g.:
//   UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
// or via Prisma Studio (`pnpm prisma studio`), editing the row directly.
export async function requireAdmin() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden: admin role required");
  }

  return session;
}
