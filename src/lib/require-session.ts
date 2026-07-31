import { auth } from "../../auth";

// Lighter counterpart to requireAdmin() (src/lib/require-admin.ts): "is *any*
// user signed in", not "is this user an admin". Needed starting Phase 5
// because favorites are gated on being signed in at all, not on the ADMIN
// role - reusing requireAdmin() for this would incorrectly lock favorites to
// admins only.
export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  return session;
}
