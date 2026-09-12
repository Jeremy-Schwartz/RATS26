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

function findOverride(game, overrides) {
  return overrides.find((override) => {
    if (override.gameId && override.gameId === game.id) {
      return true;
    }

    return (
      override.week === game.week &&
      override.homeTeam === game.homeTeam &&
      override.awayTeam === game.awayTeam
    );
  });
}
