// Core logic for auth.ts's `signIn` callback (PHASE_9_PLAN.md §2), pulled
// out into its own function so it's directly unit-testable - NextAuth's
// `callbacks.signIn` isn't independently exported/callable from the
// `NextAuth(...)` config object, only the client-facing `signIn` (trigger
// sign-in) function is, so testing the gating logic against a real DB
// requires it to live somewhere reachable outside that config literal.
// auth.ts's `signIn` callback is a thin wrapper that just forwards the raw
// GitHub profile's `login` here - no behavior differs from PHASE_9_PLAN.md's
// inline sketch, only where the code lives.
import { prisma } from "@/lib/prisma";

export async function checkAndRecordLoginAttempt(login: string | undefined): Promise<boolean> {
  if (!login) return false;

  // GitHub logins are case-insensitive on GitHub's own side (`UserName` and
  // `username` are the same account), but Postgres text equality is
  // case-sensitive, so an AllowedLogin row stored with different casing than
  // whatever GitHub's OAuth profile.login happens to return would silently
  // fail this lookup and lock a legitimate person out with no error surfaced
  // anywhere. Normalizing to lowercase here - on both the read (findUnique)
  // and the write (loginAttempt.create) - keeps this the single canonical
  // form, matching addAllowedLogin's write-path normalization in
  // src/app/actions/allowlist.ts, so LoginAttempt.githubLogin values stay
  // directly comparable to AllowedLogin.githubLogin values in the admin UI.
  const normalizedLogin = login.toLowerCase();

  const entry = await prisma.allowedLogin.findUnique({
    where: { githubLogin: normalizedLogin },
  });
  const allowed = entry?.active === true;

  await prisma.loginAttempt.create({ data: { githubLogin: normalizedLogin, allowed } });

  return allowed;
}
