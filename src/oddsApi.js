const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "americanfootball_nfl";

export async function fetchOddsApiGames(config) {
  if (!config.apiKey) {
    throw new Error("ODDS_API_KEY is required to sync from The Odds API.");
  }

  const weekWindow = getSyncWeekWindow(config);
  const [odds, scores] = await Promise.all([
    fetchJson(buildUrl(`${BASE_URL}/sports/${SPORT}/odds`, {
      apiKey: config.apiKey,
      regions: config.region,
      markets: config.spreadMarket,
      oddsFormat: config.oddsFormat,
      bookmakers: config.bookmaker,
      commenceTimeFrom: weekWindow.from,
      commenceTimeTo: weekWindow.to
    })),
    fetchJson(buildUrl(`${BASE_URL}/sports/${SPORT}/scores`, {
      apiKey: config.apiKey,
      daysFrom: 3
    }))
  ]);

  return mergeOddsAndScores(odds, scores, config);
}

function buildUrl(path, params) {
  const url = new URL(path);
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`The Odds API request failed (${response.status}): ${body}`);
  }
  return response.json();
}

export function mergeOddsAndScores(odds, scores, config) {
  const scoresById = new Map(scores.map((game) => [game.id, game]));

  return odds.map((game) => {
    const scoreGame = scoresById.get(game.id);
    const scoreMap = new Map((scoreGame?.scores ?? []).map((score) => [score.name, Number(score.score)]));
    const market = selectSpreadMarket(game, config);
    const spreads = {};

    for (const outcome of market?.outcomes ?? []) {
      spreads[outcome.name] = Number(outcome.point);
    }

    return {
      id: game.id,
      season: Number(config.season),
      week: inferWeek(game.commence_time, config),
      commenceTime: game.commence_time,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: scoreMap.has(game.home_team) ? scoreMap.get(game.home_team) : null,
      awayScore: scoreMap.has(game.away_team) ? scoreMap.get(game.away_team) : null,
      completed: Boolean(scoreGame?.completed),
      spreads
    };
  });
}

function selectSpreadMarket(game, config) {
  const preferredBookmaker = game.bookmakers?.find((bookmaker) => bookmaker.key === config.bookmaker);
  const bookmaker = preferredBookmaker ?? game.bookmakers?.[0];
  return bookmaker?.markets?.find((market) => market.key === config.spreadMarket);
}

function getSyncWeekWindow(config) {
  const start = new Date(config.regularSeasonStartDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error("REGULAR_SEASON_START_DATE must be a valid ISO date.");
  }

  const now = new Date();
  const week = Math.max(1, Math.min(18, Math.floor((now - start) / 604800000) + 1));
  const from = new Date(start.getTime() + (week - 1) * 604800000);
  const to = new Date(from.getTime() + 7 * 86400000);

  return {
    week,
    from: formatOddsApiDate(from),
    to: formatOddsApiDate(to)
  };
}

function formatOddsApiDate(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function inferWeek(commenceTime, config) {
  const date = new Date(commenceTime);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const seasonStart = new Date(config.regularSeasonStartDate);
  const days = Math.max(0, Math.floor((date - seasonStart) / 86400000));
  return Math.min(18, Math.floor(days / 7) + 1);
}
