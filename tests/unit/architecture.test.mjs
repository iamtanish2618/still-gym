import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory()
        ? sourceFiles(path)
        : /\.(tsx?|mjs|css)$/.test(path)
          ? [path]
          : [];
    }),
  );
  return nested.flat();
}
test("application, operator tools and tests remain focused modules under 300 lines", async () => {
  const files = (
    await Promise.all(["app", "server", "scripts", "tests"].map(sourceFiles))
  ).flat();
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const count = source.trimEnd().split("\n").length;
    assert.ok(
      count <= 300,
      `${path} has ${count} lines; extract a focused responsibility.`,
    );
    if (/^(app|server)\//.test(path))
      assert.ok(
        !/from\s+["'][^"']*tests\//.test(source),
        `${path} imports test fixtures into runtime.`,
      );
  }
});
