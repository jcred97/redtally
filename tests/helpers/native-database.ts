import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFile, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client";

// pg_ctl's Windows server process can inherit pipes after pg_ctl itself has exited.
async function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.toUpperCase().startsWith("PG")) delete env[key];
    }
    const child = spawn(command, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${path.basename(command)} failed (${code}): ${output}`), { code }));
    });
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

/** Creates its own disposable cluster. Never connects to DATABASE_URL or an existing server. */
export async function createNativeTestDatabase(maxConnections = 1) {
  const configuredBin = process.env.REDTALLY_POSTGRES_BIN;
  if (!configuredBin) throw new Error("Set REDTALLY_POSTGRES_BIN to a native PostgreSQL bin directory");
  const bin = path.resolve(configuredBin);
  const executable = (name: string) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
  const root = await mkdtemp(path.join(tmpdir(), "redtally-native-db-"));
  const rootPath = await realpath(root);
  const data = path.join(rootPath, "data");
  const passwordFile = path.join(rootPath, "password");
  let started = false;
  let startAttempted = false;
  let client: PrismaClient | undefined;
  let pool: Pool | undefined;
  async function close() {
    try {
      await client?.$disconnect();
    } finally {
      try {
        await pool?.end();
      } finally {
        if (startAttempted && !started) {
          try {
            await run(executable("pg_ctl"), ["status", "-D", data]);
            started = true;
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && (error.code === 3 || error.code === 4))) throw error;
          }
        }
        if (started) {
          // A failed stop deliberately leaves the cluster directory intact for recovery.
          await run(executable("pg_ctl"), ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"]);
          started = false;
        }
        const resolved = await realpath(rootPath);
        if (resolved !== rootPath || !path.basename(resolved).startsWith("redtally-native-db-")) {
          throw new Error("Refusing to remove an unexpected cluster directory");
        }
        await rm(resolved, { recursive: true, force: true });
      }
    }
  }
  try {
    const password = randomBytes(24).toString("hex");
    await writeFile(passwordFile, password, { mode: 0o600 });
    await run(executable("initdb"), ["-D", data, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256", `--pwfile=${passwordFile}`]);
    await appendFile(path.join(data, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const port = await availablePort();
    startAttempted = true;
    await run(executable("pg_ctl"), ["start", "-D", data, "-l", path.join(rootPath, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "-t", "30"]);
    started = true;
    await rm(passwordFile);
    const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    const connection = { connectionString, ssl: false as const, options: "-c client_encoding=UTF8", client_encoding: "UTF8" };
    pool = new Pool({ ...connection, max: 1 });
    const sqlPool = pool;
    const migrationDirectory = path.join(process.cwd(), "server/db/migrations");
    const migrations = (await readdir(migrationDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      await sqlPool.query(await readFile(path.join(migrationDirectory, migration, "migration.sql"), "utf8"));
    }
    client = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: maxConnections }) });
    const version = await sqlPool.query<{ version: string }>("SELECT version()");
    const db = {
      query: (sql: string, values?: unknown[]) => sqlPool.query(sql, values),
      exec: (sql: string) => sqlPool.query(sql),
    };
    return { db, client, close, connectionString, version: version.rows[0].version };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Native database setup and cleanup failed");
    }
    throw error;
  }
}
