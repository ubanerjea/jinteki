import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";
import { checkAndRecordLoginAttempt } from "@/lib/check-allowed-login";

// Auth.js v5 (next-auth@beta) config, GitHub as the sole OAuth provider per
// PROJECT_PLAN.md ("simplest OAuth app setup"). GitHub's clientId/clientSecret
// are picked up automatically from AUTH_GITHUB_ID / AUTH_GITHUB_SECRET (Auth.js's
// convention: AUTH_<PROVIDERID>_ID / AUTH_<PROVIDERID>_SECRET) - confirmed by
// reading the installed @auth/core package's env-default logic rather than
// assumed. Those env vars require a real GitHub OAuth App, which only the repo
// owner can create (see .env.example) - sign-in will not work until that's done.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  // Database sessions (not JWT) since we have a Prisma adapter - this is what
  // populates the Session table and is the adapter's recommended default.
  session: { strategy: "database" },
  callbacks: {
    // Phase 9 (PHASE_9_PLAN.md §2, plans/design/REMOTE_ACCESS_DESIGN.md
    // Decision 5): sign-in allowlist gate. `profile` is the raw GitHub OAuth
    // profile Auth.js receives mid-flow - `login` is present on every GitHub
    // profile regardless of whether the user has a public email. Returning
    // `false` here stops the flow before PrismaAdapter creates or links any
    // User/Account row, so a rejected login never persists anything besides
    // the LoginAttempt audit row written below. This gate is strictly
    // earlier than and separate from User.role (ADMIN/USER) - it decides
    // "can this GitHub account sign in at all", not "what can a signed-in
    // user do".
    async signIn({ profile }) {
      const login = (profile as { login?: string } | undefined)?.login;
      return checkAndRecordLoginAttempt(login);
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
