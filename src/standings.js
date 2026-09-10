import { teamsByAbbreviation } from "./teams.js";

export function calculateAtsResult(game, teamName) {
  const isHome = game.homeTeam === teamName;
  const isAway = game.awayTeam === teamName;

  if (!isHome && !isAway) {
    return null;
  }

  const spread = game.spreads?.[teamName];
  if (!Number.isFinite(spread)) {
    return {
      gameId: game.id,
      week: game.week,
      opponent: isHome ? game.awayTeam : game.homeTeam,
      location: isHome ? "home" : "away",
      commenceTime: game.commenceTime,
      spread: null,
      spreadStatus: game.spreadStatus ?? "unknown",
      spreadLockedAt: game.spreadLockedAt ?? null,
      spreadUpdatedAt: game.spreadUpdatedAt ?? null,
      result: "pending",
      atsMargin: null,
      teamScore: null,
      opponentScore: null
    };
  }

  if (!game.completed || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)) {
    return {
      gameId: game.id,
      week: game.week,
      opponent: isHome ? game.awayTeam : game.homeTeam,
      location: isHome ? "home" : "away",
      commenceTime: game.commenceTime,
      spread,
      spreadStatus: game.spreadStatus ?? "unknown",
      spreadLockedAt: game.spreadLockedAt ?? null,
      spreadUpdatedAt: game.spreadUpdatedAt ?? null,
      result: "pending",
      atsMargin: null,
      teamScore: null,
      opponentScore: null
    };
  }

  const teamScore = isHome ? game.homeScore : game.awayScore;
  const opponentScore = isHome ? game.awayScore : game.homeScore;
  const atsMargin = teamScore - opponentScore + spread;

  return {
    gameId: game.id,
    week: game.week,
    opponent: isHome ? game.awayTeam : game.homeTeam,
    location: isHome ? "home" : "away",
    commenceTime: game.commenceTime,
    spread,
    spreadStatus: game.spreadStatus ?? "unknown",
    spreadLockedAt: game.spreadLockedAt ?? null,
    spreadUpdatedAt: game.spreadUpdatedAt ?? null,
    result: atsMargin > 0 ? "win" : atsMargin < 0 ? "loss" : "push",
    atsMargin,
    teamScore,
    opponentScore
  };
}

export function buildStandings(league, games) {
  const rows = league.members.map((member) => {
    const team = teamsByAbbreviation.get(member.team);
    if (!team) {
      throw new Error(`Unknown NFL team abbreviation in league.json: ${member.team}`);
    }

    const results = games
      .map((game) => calculateAtsResult(game, team.name))
      .filter(Boolean)
      .sort((a, b) => a.week - b.week || new Date(a.commenceTime) - new Date(b.commenceTime));

    const wins = results.filter((result) => result.result === "win").length;
    const losses = results.filter((result) => result.result === "loss").length;
    const pushes = results.filter((result) => result.result === "push").length;
    const decided = wins + losses + pushes;
    const pending = results.filter((result) => result.result === "pending").length;
    const winPct = wins + losses > 0 ? wins / (wins + losses) : 0;

    return {
      memberId: member.id,
      memberName: member.name,
      team: team.abbreviation,
      teamName: team.name,
      wins,
      losses,
      pushes,
      pending,
      decided,
      winPct,
      points: wins + pushes * 0.5,
      results,
      streak: buildStreak(results)
    };
  });

  return rows
    .sort((a, b) => b.winPct - a.winPct || b.points - a.points || b.wins - a.wins || a.memberName.localeCompare(b.memberName))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildStreak(results) {
  const decided = results.filter((result) => ["win", "loss", "push"].includes(result.result));
  if (decided.length === 0) {
    return "-";
  }

  const latest = decided.at(-1).result;
  let count = 0;
  for (let index = decided.length - 1; index >= 0; index -= 1) {
    if (decided[index].result !== latest) {
      break;
    }
    count += 1;
  }

  return `${latest[0].toUpperCase()}${count}`;
}
