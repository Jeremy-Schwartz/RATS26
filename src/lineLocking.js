export function mergePersistedGames(currentGames, fetchedGames, now = new Date()) {
  const gamesById = new Map(currentGames.map((game) => [game.id, game]));

  for (const fetchedGame of fetchedGames) {
    const currentGame = gamesById.get(fetchedGame.id);
    gamesById.set(
      fetchedGame.id,
      currentGame ? mergeGame(currentGame, fetchedGame, now) : initializeGame(fetchedGame, now)
    );
  }

  return [...gamesById.values()].sort((a, b) => {
    const weekDelta = (a.week ?? 0) - (b.week ?? 0);
    return weekDelta || new Date(a.commenceTime) - new Date(b.commenceTime);
  });
}

function initializeGame(fetchedGame, now) {
  if (hasGameStarted(fetchedGame, now)) {
    const hasFetchedSpread = hasSpread(fetchedGame);
    return {
      ...fetchedGame,
      spreads: hasFetchedSpread ? fetchedGame.spreads : {},
      spreadStatus: hasFetchedSpread ? "locked" : "missing-line",
      spreadUpdatedAt: hasFetchedSpread ? now.toISOString() : null,
      spreadLockedAt: hasFetchedSpread ? now.toISOString() : null
    };
  }

  return {
    ...fetchedGame,
    spreadStatus: "open",
    spreadUpdatedAt: now.toISOString(),
    spreadLockedAt: null
  };
}

function mergeGame(currentGame, fetchedGame, now) {
  if (hasGameStarted(fetchedGame, now)) {
    const hasCapturedSpread = hasSpread(currentGame);
    const hasFetchedSpread = hasSpread(fetchedGame);
    const spreads = hasCapturedSpread ? currentGame.spreads : hasFetchedSpread ? fetchedGame.spreads : {};
    return {
      ...currentGame,
      ...fetchedGame,
      spreads,
      spreadStatus: hasCapturedSpread || hasFetchedSpread ? "locked" : "missing-line",
      spreadUpdatedAt: currentGame.spreadUpdatedAt ?? (hasFetchedSpread ? now.toISOString() : null),
      spreadLockedAt: hasCapturedSpread || hasFetchedSpread ? currentGame.spreadLockedAt ?? now.toISOString() : null
    };
  }

  return {
    ...currentGame,
    ...fetchedGame,
    spreads: fetchedGame.spreads,
    spreadStatus: "open",
    spreadUpdatedAt: now.toISOString(),
    spreadLockedAt: null
  };
}

function hasGameStarted(game, now) {
  const commenceTime = new Date(game.commenceTime);
  return !Number.isNaN(commenceTime.getTime()) && commenceTime <= now;
}

function hasSpread(game) {
  return Object.keys(game.spreads ?? {}).length > 0;
}
