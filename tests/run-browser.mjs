import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Each suite owns a fresh database and server. Never load .env.local into the
// runner: explicitly empty cloud credentials before starting every child.
const suites = [
  "browser",
  "browser-states",
  "browser-booking-audit",
  "browser-admin-switch",
  "browser-schedule-persistence",
  "browser-persistence",
  "browser-real-backend",
  "live-booking",
  "accessibility",
];
const selected = process.argv.slice(2);
if (selected.some((name) => !suites.includes(name)))
  throw Error("Unknown browser suite.");
const directory = `.sites-runtime/test-runs/${randomUUID()}`;
await mkdir(directory, { recursive: true });
const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(Error(`${args.join(" ")} failed (${signal || code}).`)),
    );
  });
async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
try {
  for (const name of selected.length ? selected : suites) {
    console.log(`\nBrowser suite: ${name} (isolated storage)`);
    const db = `${directory}/${name}.db`,
      port = await freePort();
    const env = {
      ...process.env,
      VERCEL: "",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      LOCAL_DATABASE_PATH: db,
      TEST_DB_DIR: db,
      TEST_URL: `http://127.0.0.1:${port}`,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    await run(["scripts/migrate.mjs"], env);
    if (name !== "browser-real-backend")
      await run(["scripts/seed-local.mjs"], env);
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let logs = "";
    for (const stream of [server.stdout, server.stderr])
      stream.on("data", (data) => {
        logs = (logs + data).slice(-12000);
      });
    try {
      const deadline = Date.now() + 45000;
      while (true) {
        if (server.exitCode !== null)
          throw Error(`Test server exited: ${logs}`);
        const ready = await fetch(env.TEST_URL + "/api/health")
          .then((r) => r.ok)
          .catch(() => false);
        if (ready) break;
        if (Date.now() > deadline)
          throw Error(`Test server did not start: ${logs}`);
        await delay(200);
      }
      await run([`tests/browser/${name}.mjs`], env);
    } finally {
      const closed = once(server, "exit");
      server.kill("SIGTERM");
      const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
      await closed;
      clearTimeout(timeout);
    }
  }
  console.log("\nAll selected browser/HTTP suites passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
