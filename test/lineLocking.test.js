import test from "node:test";
import assert from "node:assert/strict";
import { mergePersistedGames } from "../src/lineLocking.js";
import { mergeOddsAndScores } from "../src/oddsApi.js";
import { calculateAtsResult } from "../src/standings.js";

const homeTeam = "Kansas City Chiefs";
const awayTeam = "Los Angeles Chargers";
const beforeKickoff = new Date("2026-09-10T00:15:00Z");
const kickoff = new Date("2026-09-10T00:20:00Z");
const config = {
  season: 2026,
  bookmaker: "draftkings",
  spreadMarket: "spreads",
  regularSeasonStartDate: "2026-09-10T00:00:00Z"
};

function capturedGame() {
  return {
    id: "spread-preservation-fixture",
    season: 2026,
    week: 1,
    commenceTime: kickoff.toISOString(),
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null,
    completed: false,
    spreads: { [homeTeam]: -3, [awayTeam]: 3 },
    spreadStatus: "open",
    spreadUpdatedAt: "2026-09-10T00:10:00.000Z",
    spreadLockedAt: null
  };
}

const unusableSpreads = [
  ["empty", {}],
  ["absent", undefined],
  ["null", null],
  ["one-sided", { [homeTeam]: -4 }],
  ["null values", { [homeTeam]: null, [awayTeam]: null }],
  ["non-numeric", { [homeTeam]: "-4", [awayTeam]: "4" }],
  ["non-finite", { [homeTeam]: NaN, [awayTeam]: Infinity }],
  ["inconsistent pair", { [homeTeam]: -4, [awayTeam]: 3 }],
  ["unrelated teams", { Other: -4, Another: 4 }]
];

for (const [label, spreads] of unusableSpreads) {
  test(`retains captured spreads and timestamps for ${label} pregame odds`, () => {
    const saved = capturedGame();
    const [merged] = mergePersistedGames([saved], [{ ...saved, spreads }], beforeKickoff);
    assert.deepEqual(merged.spreads, saved.spreads);
    assert.equal(merged.spreadUpdatedAt, saved.spreadUpdatedAt);
    assert.equal(merged.spreadLockedAt, null);
    assert.equal(merged.spreadStatus, "open");
    assert.deepEqual(saved, capturedGame());
  });
}

test("replaces a pregame line with a complete new pair, including pick'em", () => {
  for (const point of [-4.5, 0]) {
    const saved = capturedGame();
    const spreads = { [homeTeam]: point, [awayTeam]: point === 0 ? 0 : -point };
    const [merged] = mergePersistedGames([saved], [{ ...saved, spreads }], beforeKickoff);
    assert.deepEqual(merged.spreads, spreads);
    assert.equal(merged.spreadUpdatedAt, beforeKickoff.toISOString());
    assert.equal(merged.spreadStatus, "open");
  }
});

test("score-only pregame sync retains the line for final ATS calculation after restart", () => {
  const saved = capturedGame();
  const apiGame = {
    id: saved.id,
    commence_time: saved.commenceTime,
    home_team: homeTeam,
    away_team: awayTeam,
    completed: false,
    scores: null
  };
  const fetchedPregame = mergeOddsAndScores([], [apiGame], config);
  const pregame = mergePersistedGames([saved], fetchedPregame, beforeKickoff);
  const persisted = JSON.parse(JSON.stringify(pregame));
  const fetchedFinal = mergeOddsAndScores([], [{
    ...apiGame,
    completed: true,
    scores: [{ name: homeTeam, score: "24" }, { name: awayTeam, score: "21" }]
  }], config);
  const [final] = mergePersistedGames(persisted, fetchedFinal, new Date("2026-09-10T04:00:00Z"));
  assert.deepEqual(final.spreads, saved.spreads);
  assert.equal(final.spreadUpdatedAt, saved.spreadUpdatedAt);
  assert.equal(final.spreadStatus, "locked");
  assert.equal(final.completed, true);
  assert.equal(calculateAtsResult(final, homeTeam).result, "push");
  assert.equal(calculateAtsResult(final, awayTeam).result, "push");
});

test("null API points cannot become a false pick'em line", () => {
  const saved = capturedGame();
  for (const point of [null, "", undefined, "invalid"]) {
    const fetched = mergeOddsAndScores([{
      id: saved.id,
      commence_time: saved.commenceTime,
      home_team: homeTeam,
      away_team: awayTeam,
      bookmakers: [{
        key: "draftkings",
        markets: [{
          key: "spreads",
          outcomes: [{ name: homeTeam, point }, { name: awayTeam, point }]
        }]
      }]
    }], [], config);
    assert.deepEqual(fetched[0].spreads, {});
    const [merged] = mergePersistedGames([saved], fetched, beforeKickoff);
    assert.deepEqual(merged.spreads, saved.spreads);
    assert.equal(merged.spreadUpdatedAt, saved.spreadUpdatedAt);
  }
});

test("new games without complete odds do not claim a captured line", () => {
  for (const now of [beforeKickoff, kickoff]) {
    for (const [, spreads] of unusableSpreads) {
      const [merged] = mergePersistedGames([], [{ ...capturedGame(), spreads }], now);
      assert.deepEqual(merged.spreads, {});
      assert.equal(merged.spreadUpdatedAt, null);
      assert.equal(merged.spreadLockedAt, null);
      assert.equal(merged.spreadStatus, now === kickoff ? "missing-line" : "open");
    }
  }
});

test("post-kickoff fallback records the actual time a usable line is first captured", () => {
  const saved = { ...capturedGame(), spreads: {}, spreadStatus: "missing-line" };
  const [merged] = mergePersistedGames([saved], [capturedGame()], kickoff);
  assert.equal(merged.spreadUpdatedAt, kickoff.toISOString());
  assert.equal(merged.spreadLockedAt, kickoff.toISOString());
  assert.equal(merged.spreadStatus, "locked");
  assert.deepEqual(merged.spreads, capturedGame().spreads);
});

test("unknown legacy capture timestamps are not relabeled as fresh", () => {
  const saved = { ...capturedGame(), spreadUpdatedAt: null };
  const [merged] = mergePersistedGames([saved], [{
    ...saved, spreads: { [homeTeam]: -7, [awayTeam]: 7 }
  }], kickoff);
  assert.deepEqual(merged.spreads, saved.spreads);
  assert.equal(merged.spreadUpdatedAt, null);
});

test("locked and manual lines stay protected when a feed moves kickoff into the future", () => {
  for (const spreadStatus of ["locked", "manual-override"]) {
    const saved = {
      ...capturedGame(),
      spreadStatus,
      spreadLockedAt: kickoff.toISOString()
    };
    const [merged] = mergePersistedGames([saved], [{
      ...saved,
      commenceTime: "2026-09-11T00:20:00Z",
      spreads: { [homeTeam]: -7, [awayTeam]: 7 }
    }], new Date("2026-09-10T01:00:00Z"));
    assert.deepEqual(merged.spreads, saved.spreads);
    assert.equal(merged.spreadStatus, spreadStatus);
    assert.equal(merged.spreadUpdatedAt, saved.spreadUpdatedAt);
    assert.equal(merged.spreadLockedAt, saved.spreadLockedAt);
  }
});
