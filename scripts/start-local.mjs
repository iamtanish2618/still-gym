import "./sites-env.mjs";
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--persist-to",
    process.env.LOCAL_DB_DIR || ".wrangler/state",
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
