import { passwordHash } from "../server/auth.mjs";
import { getDatabase } from "../server/database.mjs";
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
  const db = await getDatabase();
  try {
    await db.prepare(sql).run();
    console.log(
      "Admin created. Sign in with the email and password you chose.",
    );
  } finally {
    db.client.close();
  }
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1])
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
