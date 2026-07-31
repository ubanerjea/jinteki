"use server";

// Favorite-toggle Server Actions, per PHASE_5_PLAN.md's Favorites section.
// Bound to a real HTML <form action={...}> in the calling components
// (favorite-toggle-form.tsx) rather than invoked via client-side fetch, so
// they work as genuine progressive-enhancement form submissions - which
// also makes them directly curl-testable (a real POST with the form's
// encoded hidden fields + a session cookie), the same "real HTTP request
// with a real session" technique used for every other auth-gated route
// since Phase 1.
//
// Unauthenticated attempts: requireSession() throws when there's no
// session; caught here and turned into a redirect to the sign-in page
// (an actual rejection a signed-out request can observe, not a silent
// no-op) rather than the generic error-boundary a raw throw would produce.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

async function requireSessionOrRedirectToSignIn() {
  try {
    return await requireSession();
  } catch {
    redirect("/api/auth/signin");
  }
}

export async function toggleCardFavorite(cardCode: string) {
  const session = await requireSessionOrRedirectToSignIn();
  const userId = session.user.id;

  const existing = await prisma.cardFavorite.findUnique({
    where: { userId_cardCode: { userId, cardCode } },
  });

  if (existing) {
    await prisma.cardFavorite.delete({
      where: { userId_cardCode: { userId, cardCode } },
    });
  } else {
    await prisma.cardFavorite.create({ data: { userId, cardCode } });
  }

  revalidatePath(`/cards/${cardCode}`);
  revalidatePath("/favorites");
}

export async function toggleDecklistFavorite(decklistId: string) {
  const session = await requireSessionOrRedirectToSignIn();
  const userId = session.user.id;

  const existing = await prisma.decklistFavorite.findUnique({
    where: { userId_decklistId: { userId, decklistId } },
  });

  if (existing) {
    await prisma.decklistFavorite.delete({
      where: { userId_decklistId: { userId, decklistId } },
    });
  } else {
    await prisma.decklistFavorite.create({ data: { userId, decklistId } });
  }

  revalidatePath(`/decklists/${decklistId}`);
  revalidatePath("/favorites");
}
