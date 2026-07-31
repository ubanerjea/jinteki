import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// GET /cards/random - redirects to a random card's detail page. A static
// route (not `[code]/route.ts`) so Next.js resolves `/cards/random` here
// rather than treating "random" as a dynamic `code` segment - static
// segments take priority over dynamic ones at the same level.
//
// `ORDER BY random() LIMIT 1` is a full sequential scan, but cheap at 2054
// rows (PHASE_5_PLAN.md: "Simple and cheap at 2054 rows ... or a cheaper
// random-offset approach if that turns out to matter in practice" - it
// doesn't, at this table size).
export async function GET(request: Request) {
  const rows = await prisma.$queryRaw<{ code: string }[]>(
    Prisma.sql`SELECT code FROM "Card" ORDER BY random() LIMIT 1`,
  );
  const code = rows[0]?.code;

  if (!code) {
    return NextResponse.json({ error: "No cards found" }, { status: 404 });
  }

  return NextResponse.redirect(new URL(`/cards/${code}`, request.url));
}
