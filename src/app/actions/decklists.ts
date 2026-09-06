"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addOwnedDecklistCard,
  cloneOwnedDecklist,
  createOwnedDecklist,
  deleteOwnedDecklist,
  removeOwnedDecklistCard,
  updateOwnedDecklist,
} from "@/lib/owned-decklists";
import { requireSession } from "@/lib/require-session";

async function requireSessionOrRedirectToSignIn() {
  try {
    return await requireSession();
  } catch {
    redirect("/api/auth/signin");
  }
}

function revalidateDecklist(id: string) {
  revalidatePath(`/decklists/${id}`);
  revalidatePath(`/decklists/${id}/edit`);
  revalidatePath("/me");
  revalidatePath("/decklists");
}

export async function createDecklist(formData: FormData) {
  const session = await requireSessionOrRedirectToSignIn();
  const id = await createOwnedDecklist({
    userId: session.user.id,
    name: String(formData.get("name") ?? ""),
    identityCode: String(formData.get("identityCode") ?? ""),
  });
  revalidateDecklist(id);
  redirect(`/decklists/${id}/edit`);
}

export async function cloneDecklist(sourceId: string) {
  const session = await requireSessionOrRedirectToSignIn();
  const id = await cloneOwnedDecklist({
    userId: session.user.id,
    sourceId,
  });
  revalidateDecklist(id);
  redirect(`/decklists/${id}`);
}

export async function updateDecklist(formData: FormData) {
  const session = await requireSessionOrRedirectToSignIn();
  const id = String(formData.get("id") ?? "");
  const cardCodes = formData.getAll("cardCode").map((v) => String(v));
  const quantities = formData.getAll("quantity").map((v) => Number(v));
  const slots = cardCodes.map((cardCode, i) => ({
    cardCode,
    quantity: quantities[i] ?? 1,
  }));
  await updateOwnedDecklist({
    userId: session.user.id,
    id,
    name: String(formData.get("name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    identityCode: String(formData.get("identityCode") ?? ""),
    isPublic: formData.get("isPublic") === "1",
    slots,
  });
  revalidateDecklist(id);
  const params = new URLSearchParams();
  params.set("saved", "1");
  const q = String(formData.get("q") ?? "").trim();
  const order = String(formData.get("order") ?? "").trim();
  if (q) params.set("q", q);
  if (order) params.set("order", order);
  redirect(`/decklists/${id}/edit?${params.toString()}`);
}

export async function addDecklistCard(formData: FormData) {
  const session = await requireSessionOrRedirectToSignIn();
  const decklistId = String(formData.get("decklistId") ?? "");
  await addOwnedDecklistCard({
    userId: session.user.id,
    decklistId,
    cardCode: String(formData.get("cardCode") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
  });
  revalidateDecklist(decklistId);
}

export async function removeDecklistCard(formData: FormData) {
  const session = await requireSessionOrRedirectToSignIn();
  const decklistId = String(formData.get("decklistId") ?? "");
  await removeOwnedDecklistCard({
    userId: session.user.id,
    decklistId,
    cardCode: String(formData.get("cardCode") ?? ""),
  });
  revalidateDecklist(decklistId);
}

export async function deleteDecklist(id: string) {
  const session = await requireSessionOrRedirectToSignIn();
  await deleteOwnedDecklist({ userId: session.user.id, id });
  revalidatePath("/me");
  revalidatePath("/decklists");
  redirect("/me");
}
