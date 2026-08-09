// Integration test against the real Postgres database (docker compose up -d
// + vitest.config.ts loading DATABASE_URL from .env), matching
// src/lib/search/cards.test.ts's precedent of testing real DB behavior
// rather than mocking Prisma - PHASE_9_PLAN.md §2 explicitly calls out
// confirming a rejected sign-in leaves zero new rows "rather than assuming
// Auth.js's documented behavior holds," so this exercises the actual
// checkAndRecordLoginAttempt() logic auth.ts's signIn callback delegates
// to, against real AllowedLogin/LoginAttempt rows.
//
// Uses randomly-suffixed githubLogin values per test so this file can run
// repeatedly against the shared dev DB without colliding with real rows
// (e.g. the seeded "ubanerjea") or with itself across runs.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { checkAndRecordLoginAttempt } from "./check-allowed-login";

afterAll(async () => {
  await prisma.$disconnect();
});

function testLogin(label: string) {
  return `test-${label}-${randomUUID().slice(0, 8)}`;
}

describe("checkAndRecordLoginAttempt", () => {
  it("returns false and records no LoginAttempt for an undefined login", async () => {
    const before = await prisma.loginAttempt.count();
    const result = await checkAndRecordLoginAttempt(undefined);
    const after = await prisma.loginAttempt.count();

    expect(result).toBe(false);
    expect(after).toBe(before);
  });

  it("returns true and records an allowed attempt for an active AllowedLogin", async () => {
    const login = testLogin("active");
    await prisma.allowedLogin.create({ data: { githubLogin: login, active: true } });

    const result = await checkAndRecordLoginAttempt(login);
    expect(result).toBe(true);

    const attempt = await prisma.loginAttempt.findFirst({
      where: { githubLogin: login },
      orderBy: { attemptedAt: "desc" },
    });
    expect(attempt?.allowed).toBe(true);
  });

  it("returns false and records a denied attempt for a deactivated AllowedLogin", async () => {
    const login = testLogin("inactive");
    await prisma.allowedLogin.create({ data: { githubLogin: login, active: false } });

    const result = await checkAndRecordLoginAttempt(login);
    expect(result).toBe(false);

    const attempt = await prisma.loginAttempt.findFirst({
      where: { githubLogin: login },
      orderBy: { attemptedAt: "desc" },
    });
    expect(attempt?.allowed).toBe(false);
  });

  it("returns false and records a denied attempt for a login never added to AllowedLogin", async () => {
    const login = testLogin("stranger");

    const entry = await prisma.allowedLogin.findUnique({ where: { githubLogin: login } });
    expect(entry).toBeNull();

    const result = await checkAndRecordLoginAttempt(login);
    expect(result).toBe(false);

    const attempt = await prisma.loginAttempt.findFirst({
      where: { githubLogin: login },
      orderBy: { attemptedAt: "desc" },
    });
    expect(attempt?.allowed).toBe(false);
  });

  it("reflects reactivation: deactivate then reactivate flips the result back to true", async () => {
    const login = testLogin("toggle");
    await prisma.allowedLogin.create({ data: { githubLogin: login, active: true } });
    expect(await checkAndRecordLoginAttempt(login)).toBe(true);

    await prisma.allowedLogin.update({ where: { githubLogin: login }, data: { active: false } });
    expect(await checkAndRecordLoginAttempt(login)).toBe(false);

    await prisma.allowedLogin.update({ where: { githubLogin: login }, data: { active: true } });
    expect(await checkAndRecordLoginAttempt(login)).toBe(true);
  });

  // Case-sensitivity gap fix: GitHub logins are case-insensitive on GitHub's
  // own side (`UserName` and `username` are the same account), but a plain
  // Postgres findUnique on githubLogin is an exact, case-SENSITIVE match. An
  // AllowedLogin row stored with different casing than whatever GitHub's
  // OAuth profile.login actually returns must still match, or a legitimate
  // account gets silently locked out with no error surfaced anywhere.
  it("matches an AllowedLogin stored in one case against a lookup in a different case", async () => {
    const login = testLogin("mixedcase");
    // Store the row in canonical lowercase - the form every row takes once
    // written through addAllowedLogin()'s own normalization (see
    // src/app/actions/allowlist.ts) - then look it up using a *different*
    // (mixed/upper) casing, mirroring GitHub's OAuth profile.login returning
    // different casing than what was stored (GitHub logins are
    // case-insensitive on GitHub's own side, e.g. `UserName` and `username`
    // are the same account).
    await prisma.allowedLogin.create({ data: { githubLogin: login, active: true } });
    const differentCasingInput = login.toUpperCase();

    const result = await checkAndRecordLoginAttempt(differentCasingInput);
    expect(result).toBe(true);

    // The recorded LoginAttempt.githubLogin should also be in canonical
    // (lowercase) form, not the mixed/upper casing passed in - so
    // LoginAttempt and AllowedLogin stay directly comparable by eye in the
    // admin UI.
    const attempt = await prisma.loginAttempt.findFirst({
      where: { githubLogin: login },
      orderBy: { attemptedAt: "desc" },
    });
    expect(attempt?.allowed).toBe(true);
    expect(attempt?.githubLogin).toBe(login);
  });

  it("records a lowercase LoginAttempt.githubLogin even when called with mixed-case input", async () => {
    const login = testLogin("recordcase");
    const mixedCaseInput = `${login.slice(0, 4).toUpperCase()}${login.slice(4)}`;

    await checkAndRecordLoginAttempt(mixedCaseInput);

    const attempt = await prisma.loginAttempt.findFirst({
      where: { githubLogin: login },
      orderBy: { attemptedAt: "desc" },
    });
    expect(attempt).not.toBeNull();
    expect(attempt?.githubLogin).toBe(login);
  });
});
