import { env } from "cloudflare:workers";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const database = env.DB as AnyD1Database | undefined;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(database, { schema });
}

export function getD1() {
  const database = env.DB as AnyD1Database | undefined;
  if (!database) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return database;
}
