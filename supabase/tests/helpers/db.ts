// Throwaway Postgres 17 (the Supabase major version) for SQL tests: fresh cluster per test file,
// Supabase stub applied, then every supabase/migrations/*.sql in name order.
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestDb {
  sql: postgres.Sql;
  as<T>(role: "anon" | "authenticated" | "service_role", sub: string | null, query: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>;
  stop(): Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const dir = await mkdtemp(path.join(tmpdir(), "spookpad-pg-"));
  const port = await freePort(); // test files start their databases in parallel: never share a port
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "test", port, persistent: true, initdbFlags: ["--encoding=UTF8"] }); // we delete the folder ourselves (below), tolerating Windows locks
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("test");
  const sql = postgres(`postgres://postgres:test@localhost:${port}/test`, { max: 1, onnotice: () => {} });

  await sql.unsafe(await readFile(path.join("supabase", "tests", "helpers", "supabase-stub.sql"), "utf8"));
  const migrations = path.join("supabase", "migrations");
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort()) {
    const text = await readFile(path.join(migrations, file), "utf8");
    await sql.begin((tx) => tx.unsafe(text));
  }

  return {
    sql,
    // runs `query` as a Supabase API role with the given JWT subject, inside a transaction
    as: (role, sub, query) =>
      sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await tx`select set_config('request.jwt.claims', ${JSON.stringify(sub ? { sub, role } : { role })}, true)`;
        return query(tx);
      }) as Promise<never>,
    stop: async () => {
      await sql.end();
      await pg.stop();
      // Windows can hold the stopped cluster's files a moment longer: retry, and never fail a test over cleanup
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
    },
  };
}

// A port the OS says is free right now.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}
