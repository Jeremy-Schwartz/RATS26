import test from "node:test";
import assert from "node:assert/strict";
import { calculateAtsResult, buildStandings } from "../src/standings.js";
import { mergeOddsAndScores } from "../src/oddsApi.js";
import { mergePersistedGames } from "../src/lineLocking.js";
import { applyLineOverrides } from "../src/lineOverrides.js";

test("calculates ATS win, loss, and push from the assigned team's perspective", () => {
  const game = {
    id: "game-1",
    week: 1,
    commenceTime: "2026-09-10T00:20:00.000Z",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Los Angeles Chargers",
    homeScore: 27,
    awayScore: 24,
    completed: true,
    spreads: {
      "Kansas City Chiefs": -3,
      "Los Angeles Chargers": 3
    }
  };

  assert.equal(calculateAtsResult(game, "Kansas City Chiefs").result, "push");
  assert.equal(calculateAtsResult({ ...game, homeScore: 28 }, "Kansas City Chiefs").result, "win");
  assert.equal(calculateAtsResult({ ...game, homeScore: 26 }, "Kansas City Chiefs").result, "loss");
});

test("builds standings sorted by ATS winning percentage", () => {
  const league = {
    members: [
      { id: "a", name: "Alex", team: "KC" },
      { id: "b", name: "Blake", team: "BUF" }
    ]
  };
  const games = [
    {
      id: "game-1",
      week: 1,
      commenceTime: "2026-09-10T00:20:00.000Z",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Buffalo Bills",
      homeScore: 30,
      awayScore: 20,
      completed: true,
      spreads: {
        "Kansas City Chiefs": -3,
        "Buffalo Bills": 3
      }
    }
  ];

  const standings = buildStandings(league, games);

  assert.equal(standings[0].memberName, "Alex");
  assert.equal(standings[0].wins, 1);
  assert.equal(standings[1].losses, 1);
});

test("infers January games as late regular-season weeks for the configured season", () => {
  const games = mergeOddsAndScores([
    {
      id: "jan-game",
      commence_time: "2027-01-01T01:15:00Z",
      home_team: "Cincinnati Bengals",
      away_team: "Baltimore Ravens",
      bookmakers: [
        {
          key: "draftkings",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Baltimore Ravens", point: 2.5 },
                { name: "Cincinnati Bengals", point: -2.5 }
              ]
            }
          ]
        }
      ]
    }
  ], [], {
    season: 2026,
    bookmaker: "draftkings",
    spreadMarket: "spreads",
    regularSeasonStartDate: "2026-09-10T00:00:00Z"
  });

  assert.equal(games[0].week, 17);
});

test("locks the last captured spread once a game starts", () => {
  const currentGames = [
    {
      id: "game-1",
      week: 1,
      commenceTime: "2026-09-10T00:20:00.000Z",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Los Angeles Chargers",
      homeScore: null,
      awayScore: null,
      completed: false,
      spreads: {
        "Kansas City Chiefs": -3.5,
        "Los Angeles Chargers": 3.5
      },
      spreadStatus: "open",
      spreadUpdatedAt: "2026-09-10T00:10:00.000Z",
      spreadLockedAt: null
    }
  ];
  const fetchedGames = [
    {
      ...currentGames[0],
      homeScore: 7,
      awayScore: 0,
      spreads: {
        "Kansas City Chiefs": -6.5,
        "Los Angeles Chargers": 6.5
      }
    }
  ];

  const merged = mergePersistedGames(currentGames, fetchedGames, new Date("2026-09-10T00:21:00.000Z"));

  assert.equal(merged[0].spreads["Kansas City Chiefs"], -3.5);
  assert.equal(merged[0].homeScore, 7);
  assert.equal(merged[0].spreadStatus, "locked");
});

test("locks first-seen synced spreads after kickoff", () => {
  const fetchedGames = [
    {
      id: "game-2",
      week: 1,
      commenceTime: "2026-09-10T00:20:00.000Z",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Los Angeles Chargers",
      homeScore: 7,
      awayScore: 0,
      completed: false,
      spreads: {
        "Kansas City Chiefs": -6.5,
        "Los Angeles Chargers": 6.5
      }
    }
  ];

  const merged = mergePersistedGames([], fetchedGames, new Date("2026-09-10T00:21:00.000Z"));

  assert.equal(merged[0].spreads["Kansas City Chiefs"], -6.5);
  assert.equal(merged[0].spreadStatus, "locked");
  assert.equal(merged[0].spreadUpdatedAt, "2026-09-10T00:21:00.000Z");
});

test("keeps completed score-only games from the scores endpoint", () => {
  const games = mergeOddsAndScores([], [
    {
      id: "completed-game",
      commence_time: "2026-09-10T00:20:00Z",
      home_team: "Seattle Seahawks",
      away_team: "New England Patriots",
      completed: true,
      scores: [
        { name: "Seattle Seahawks", score: "24" },
        { name: "New England Patriots", score: "20" }
      ]
    }
  ], {
    season: 2026,
    bookmaker: "draftkings",
    spreadMarket: "spreads",
    regularSeasonStartDate: "2026-09-10T00:00:00Z"
  });

  assert.equal(games.length, 1);
  assert.equal(games[0].completed, true);
  assert.equal(games[0].homeScore, 24);
  assert.equal(games[0].awayScore, 20);
});

test("updates final scores after odds disappear while preserving the locked spread", () => {
  const currentGames = [
    {
      id: "completed-game",
      week: 1,
      commenceTime: "2026-09-10T00:20:00Z",
      homeTeam: "Seattle Seahawks",
      awayTeam: "New England Patriots",
      homeScore: 10,
      awayScore: 10,
      completed: false,
      spreads: {
        "Seattle Seahawks": -3.5,
        "New England Patriots": 3.5
      },
      spreadStatus: "locked",
      spreadUpdatedAt: "2026-09-10T00:18:00.000Z",
      spreadLockedAt: "2026-09-10T00:21:00.000Z"
    }
  ];
  const fetchedGames = [
    {
      id: "completed-game",
      week: 1,
      commenceTime: "2026-09-10T00:20:00Z",
      homeTeam: "Seattle Seahawks",
      awayTeam: "New England Patriots",
      homeScore: 24,
      awayScore: 20,
      completed: true,
      spreads: {}
    }
  ];

  const merged = mergePersistedGames(currentGames, fetchedGames, new Date("2026-09-10T03:30:00.000Z"));

  assert.equal(merged[0].homeScore, 24);
  assert.equal(merged[0].awayScore, 20);
  assert.equal(merged[0].completed, true);
  assert.equal(merged[0].spreads["Seattle Seahawks"], -3.5);
});

test("applies manual line overrides by game id", () => {
  const games = [
    {
      id: "seahawks-patriots",
      week: 1,
      commenceTime: "2026-09-10T00:20:00Z",
      homeTeam: "Seattle Seahawks",
      awayTeam: "New England Patriots",
      homeScore: 24,
      awayScore: 20,
      completed: true,
      spreads: {
        "Seattle Seahawks": 7.5,
        "New England Patriots": -7.5
      },
      spreadStatus: "locked"
    }
  ];

  const corrected = applyLineOverrides(games, [
    {
      gameId: "seahawks-patriots",
      spreads: {
        "Seattle Seahawks": -3,
        "New England Patriots": 3
      }
    }
  ], new Date("2026-09-10T03:30:00.000Z"));

  assert.equal(corrected[0].spreads["Seattle Seahawks"], -3);
  assert.equal(corrected[0].spreadStatus, "manual-override");
});
