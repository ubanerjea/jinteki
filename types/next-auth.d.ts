import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Module augmentation so `session.user.role` / `session.user.id` are typed,
// matching the `role` callback added in auth.ts's `session` callback.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}
