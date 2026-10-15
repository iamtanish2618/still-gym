import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
// Use Wrangler's migration ledger. This command is safe to repeat.
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
config.main = resolve("dist/server", config.main);
config.assets.directory = resolve("dist/server", config.assets.directory);
config.d1_databases[0].migrations_dir = resolve("drizzle");
mkdirSync(".sites-runtime", { recursive: true });
writeFileSync(".sites-runtime/migrations.json", JSON.stringify(config));
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    ".sites-runtime/migrations.json",
    "--persist-to",
    process.env.LOCAL_DB_DIR || ".wrangler/state",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status || 0;
