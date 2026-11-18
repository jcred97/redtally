import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

/** Isolated PostgreSQL with the full migration history; never reads DATABASE_URL. */
export async function createTestDatabase(maxConnections = 1) {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({
    db, host: "127.0.0.1", port: 0, maxConnections,
  });
  let client: PrismaClient | undefined;
  let started = false;

  async function close() {
    try {
      await client?.$disconnect();
    } finally {
      try {
        if (started) await server.stop();
      } finally {
        await db.close();
      }
    }
  }

  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      await db.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }
    await server.start();
    started = true;
    const connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        max: maxConnections,
      }),
    });
    return { db, client, connectionString, close };
  } catch (error) {
    await close();
    throw error;
  }
}
