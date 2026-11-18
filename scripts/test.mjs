import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function discoverTests(directory) {
  const files = await Promise.all(
    (await readdir(directory, { withFileTypes: true })).map((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverTests(file);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [file] : [];
    }),
  );
  return files.flat().sort();
}

const tests = await discoverTests("tests");
if (tests.length === 0) throw new Error("No test files found under tests/");

// Limit simultaneous in-memory PostgreSQL instances on developer and CI machines.
const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", "--test-concurrency=2",
  ...process.argv.slice(2), ...tests,
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
