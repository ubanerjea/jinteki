import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Vitest (unlike `tsx`, which the sync scripts run under - see
// src/sync/*.ts's `pnpm sync:*` scripts) does not auto-load `.env`. Phase 4
// adds the first tests that need a real DATABASE_URL (src/lib/search's
// integration tests, which exercise real pg_trgm ranking against the real
// synced DB rather than fixture-based mapping like Phase 2/3's tests), so
// `.env` needs to be parsed here and injected via `test.env`. No `dotenv`
// dependency needed for this repo's simple `KEY=VALUE`-per-line `.env`
// format - a tiny hand-rolled parser is enough.
function loadDotEnv(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, "utf-8");
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: loadDotEnv(fileURLToPath(new URL("./.env", import.meta.url))),
  },
});
