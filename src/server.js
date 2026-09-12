import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeApiKey, loadDotEnv } from "./env.js";
import { buildStandings } from "./standings.js";
import { mergePersistedGames } from "./lineLocking.js";
import { applyLineOverrides } from "./lineOverrides.js";
import { fetchOddsApiGames } from "./oddsApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const publicDir = path.join(rootDir, "public");
const leaguePath = path.join(dataDir, "league.json");
const gamesPath = path.join(dataDir, "games.json");
const lineOverridesPath = path.join(dataDir, "line-overrides.json");

await loadDotEnv(path.join(rootDir, ".env"));

const config = {
  apiKey: process.env.ODDS_API_KEY,
  port: Number(process.env.PORT ?? 3000),
  season: Number(process.env.SEASON ?? 2026),
  spreadMarket: process.env.SPREAD_MARKET ?? "spreads",
  region: process.env.REGION ?? "us",
  oddsFormat: process.env.ODDS_FORMAT ?? "american",
  bookmaker: process.env.BOOKMAKER ?? "draftkings",
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 15),
  regularSeasonStartDate: process.env.REGULAR_SEASON_START_DATE ?? `${process.env.SEASON ?? 2026}-09-10T00:00:00Z`
};

if (process.argv.includes("--sync-once")) {
  await syncGames();
  process.exit(0);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      await sendJson(response, await buildDashboardPayload());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {
      const syncResult = await syncGames();
      await sendJson(response, syncResult);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      await sendJson(response, {
        season: config.season,
        bookmaker: config.bookmaker,
        spreadMarket: config.spreadMarket,
        hasApiKey: Boolean(config.apiKey),
        apiKeyStatus: describeApiKey(config.apiKey)
      });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(config.port, () => {
  console.log(`RATS 2026 running at http://localhost:${config.port}`);
  console.log(`Using ${config.bookmaker} ${config.spreadMarket}; API key ${describeApiKey(config.apiKey)}`);
});

if (config.apiKey && config.syncIntervalMinutes > 0) {
  setInterval(() => {
    syncGames().catch((error) => console.error(error.message));
  }, config.syncIntervalMinutes * 60 * 1000);
}

async function buildDashboardPayload() {
  const league = await readJson(leaguePath);
  const gameStore = await readJson(gamesPath);
  const games = applyLineOverrides(gameStore.games, await readOptionalJson(lineOverridesPath, []));
  const standings = buildStandings(league, games);
  const weeks = [...new Set(games.map((game) => game.week).filter(Number.isFinite))].sort((a, b) => a - b);

  return {
    league: {
      season: league.season,
      members: league.members
    },
    updatedAt: gameStore.updatedAt,
    source: gameStore.source,
    standings,
    weeks
  };
}

async function syncGames() {
  const currentStore = await readJson(gamesPath);
  const fetchedGames = await fetchOddsApiGames(config);
  const games = applyLineOverrides(
    mergePersistedGames(currentStore.games, fetchedGames),
    await readOptionalJson(lineOverridesPath, [])
  );
  const payload = {
    updatedAt: new Date().toISOString(),
    source: "the-odds-api",
    games
  };

  await writeFile(gamesPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    ok: true,
    updatedAt: payload.updatedAt,
    games: games.length
  };
}

async function serveStatic(urlPathname, response) {
  const safePath = urlPathname === "/" ? "/index.html" : urlPathname;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[ext] ?? "application/octet-stream";

  response.writeHead(200, { "content-type": contentType });
  response.end(await readFile(filePath));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return readJson(filePath);
}

async function sendJson(response, data) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sendError(response, error) {
  console.error(error);
  response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: error.message }));
}
