import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

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
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
