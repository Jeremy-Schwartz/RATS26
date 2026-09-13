import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;

export function createGameStore(config) {
  if (config.databaseUrl) {
    return createPostgresGameStore(config);
  }

  return createJsonGameStore(config.gamesPath);
}

function createJsonGameStore(gamesPath) {
  return {
    type: "json",
    async read() {
      return readJson(gamesPath);
    },
    async write(payload) {
      await writeFile(gamesPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }
  };
}

function createPostgresGameStore(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
  });
  const ready = initializePostgres(pool, config.gamesPath);

  return {
    type: "postgres",
    async read() {
      await ready;
      const result = await pool.query("select value from app_state where key = $1", ["games"]);
      return result.rows[0]?.value ?? createEmptyGameStore();
    },
    async write(payload) {
      await ready;
      await pool.query(
        `
          insert into app_state (key, value, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (key)
          do update set value = excluded.value, updated_at = now()
        `,
        ["games", JSON.stringify(payload)]
      );
    }
  };
}

async function initializePostgres(pool, gamesPath) {
  await pool.query(`
    create table if not exists app_state (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);

  const result = await pool.query("select 1 from app_state where key = $1", ["games"]);
  if (result.rowCount > 0) {
    return;
  }

  const initialPayload = existsSync(gamesPath) ? await readJson(gamesPath) : createEmptyGameStore();
  await pool.query(
    "insert into app_state (key, value, updated_at) values ($1, $2::jsonb, now())",
    ["games", JSON.stringify(initialPayload)]
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function createEmptyGameStore() {
  return {
    updatedAt: null,
    source: "not-synced",
    games: []
  };
}
