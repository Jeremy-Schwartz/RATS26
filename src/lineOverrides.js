export function applyLineOverrides(games, overrides, now = new Date()) {
  return games.map((game) => {
    const override = findOverride(game, overrides);
    if (!override) {
      return game;
    }

    return {
      ...game,
      spreads: override.spreads,
      spreadStatus: "manual-override",
      spreadUpdatedAt: game.spreadUpdatedAt ?? now.toISOString(),
      spreadLockedAt: game.spreadLockedAt ?? now.toISOString(),
      manualOverride: {
        note: override.note ?? null,
        appliedAt: now.toISOString()
      }
    };
  });
}

export function summarizeLineOverrides(games, overrides) {
  return overrides.map((override) => {
    const matchingGames = games.filter((game) => findOverride(game, [override]));
    return {
      gameId: override.gameId ?? null,
      week: override.week ?? null,
      homeTeam: override.homeTeam ?? null,
      awayTeam: override.awayTeam ?? null,
      spreads: override.spreads,
      note: override.note ?? null,
      matches: matchingGames.map((game) => ({
        id: game.id,
        week: game.week,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        spreadStatus: game.spreadStatus ?? "unknown"
      }))
    };
  });
}

function findOverride(game, overrides) {
  return overrides.find((override) => {
    if (override.gameId && override.gameId === game.id) {
      return true;
    }

    if (override.week !== game.week || !override.homeTeam || !override.awayTeam) {
      return false;
    }

    const exactHomeAwayMatch = override.homeTeam === game.homeTeam && override.awayTeam === game.awayTeam;
    const sameTeamMatchup =
      [override.homeTeam, override.awayTeam].sort().join("|") === [game.homeTeam, game.awayTeam].sort().join("|");

    return exactHomeAwayMatch || sameTeamMatchup;
  });
}
