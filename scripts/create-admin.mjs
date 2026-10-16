import { passwordHash } from "../server/auth.mjs";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

export async function adminStatement({ name, email, password }) {
  name = typeof name === "string" ? name.trim() : "";
  email = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 60)
    throw Error("Name must be 2–60 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw Error("Enter a valid email address.");
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    throw Error("Password must be 10–128 characters.");
  const quote = (x) => `'${x.replaceAll("'", "''")}'`;
  const hash = await passwordHash(password);
  return `INSERT INTO users(name,email,password_hash,role) VALUES(${quote(name)},${quote(email)},${quote(hash)},'admin');`;
}
async function hiddenPassword() {
  process.stdout.write("Admin password (hidden, 10–128 characters): ");
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = () => {
      process.stdin.removeListener("data", read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const read = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(Error("Cancelled."));
          return;
        }
        if (char === "\u007f" || char === "\b")
          value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", read);
  });
}
async function main() {
  let input;
  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const name = await rl.question("Admin full name: "),
      email = await rl.question("Admin email: ");
    rl.close();
    input = { name, email, password: await hiddenPassword() };
  } else {
    let text = "";
    for await (const chunk of process.stdin) {
      text += chunk;
      if (text.length > 4096) throw Error("Input too large.");
    }
    input = JSON.parse(text);
  }
  const sql = await adminStatement(input);
  await mkdir(".sites-runtime", { recursive: true });
  const file = `.sites-runtime/admin-${crypto.randomUUID()}.sql`;
  try {
    await writeFile(file, sql, { mode: 0o600 });
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        "./scripts/sites-env.mjs",
        "./node_modules/wrangler/bin/wrangler.js",
        "d1",
        "execute",
        "DB",
        "--local",
        "--config",
        "dist/server/wrangler.json",
        "--persist-to",
        process.env.LOCAL_DB_DIR || ".wrangler/state",
        "--file",
        file,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0)
      throw Error(
        "Admin creation failed. Confirm migrations ran and that the email is unused. Existing accounts were not changed.",
      );
    console.log(
      "Admin created in your local database. Sign in with the email and password you chose.",
    );
  } finally {
    await unlink(file).catch(() => {});
  }
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1])
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
