import { createClient } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Every production instance talks to the same primary. No embedded replicas or
// process-local booking state: database triggers arbitrate competing writes.
export function adaptClient(client) {
  const result = (r) => ({
    meta: {
      changes: r.rowsAffected,
      last_row_id: Number(r.lastInsertRowid || 0),
    },
  });
  return {
    client,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return (
            (await client.execute({ sql, args: this.args })).rows[0] || null
          );
        },
        async all() {
          return {
            results: (await client.execute({ sql, args: this.args })).rows,
          };
        },
        async run() {
          return result(await client.execute({ sql, args: this.args }));
        },
      };
    },
    async batch(statements) {
      return (
        await client.batch(
          statements.map(({ sql, args }) => ({ sql, args })),
          "write",
        )
      ).map(result);
    },
  };
}
let database;
export async function getDatabase() {
  if (database) return database;
  let url = process.env.TURSO_DATABASE_URL?.trim();
  const production = Boolean(process.env.VERCEL);
  if (
    production &&
    (!url || !process.env.TURSO_AUTH_TOKEN || !/^(libsql|https):\/\//.test(url))
  )
    throw Error(
      "Configure the shared Turso database before deployment. Local file storage is forbidden on Vercel.",
    );
  if (!url) {
    const path = resolve(
      /* turbopackIgnore: true */ process.env.LOCAL_DATABASE_PATH ||
        ".local/still.db",
    );
    await mkdir(dirname(path), { recursive: true });
    url = `file:${path}`;
  }
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    intMode: "number",
  });
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute("PRAGMA busy_timeout=5000");
    await client.execute("PRAGMA journal_mode=WAL");
  }
  database = adaptClient(client);
  return database;
}
