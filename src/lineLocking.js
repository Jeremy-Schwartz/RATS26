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
  const hasFetchedSpread = hasSpread(fetchedGame);
  if (hasGameStarted(fetchedGame, now)) {
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
    spreads: hasFetchedSpread ? fetchedGame.spreads : {},
    spreadStatus: "open",
    spreadUpdatedAt: hasFetchedSpread ? now.toISOString() : null,
    spreadLockedAt: null
  };
}

function mergeGame(currentGame, fetchedGame, now) {
  const hasCapturedSpread = hasSpread(currentGame);
  const hasFetchedSpread = hasSpread(fetchedGame);
  const alreadyLocked = hasCapturedSpread && (
    currentGame.spreadStatus === "locked" ||
    currentGame.spreadStatus === "manual-override" ||
    currentGame.spreadLockedAt != null
  );

  if (alreadyLocked || hasGameStarted(fetchedGame, now)) {
    const spreads = hasCapturedSpread ? currentGame.spreads : hasFetchedSpread ? fetchedGame.spreads : {};
    return {
      ...currentGame,
      ...fetchedGame,
      spreads,
      spreadStatus: hasCapturedSpread && currentGame.spreadStatus === "manual-override"
        ? "manual-override"
        : hasCapturedSpread || hasFetchedSpread ? "locked" : "missing-line",
      spreadUpdatedAt: hasCapturedSpread
        ? currentGame.spreadUpdatedAt ?? null
        : hasFetchedSpread ? now.toISOString() : null,
      spreadLockedAt: hasCapturedSpread || hasFetchedSpread ? currentGame.spreadLockedAt ?? now.toISOString() : null
    };
  }

  return {
    ...currentGame,
    ...fetchedGame,
    spreads: hasFetchedSpread ? fetchedGame.spreads : hasCapturedSpread ? currentGame.spreads : {},
    spreadStatus: "open",
    spreadUpdatedAt: hasFetchedSpread
      ? now.toISOString()
      : hasCapturedSpread ? currentGame.spreadUpdatedAt ?? null : null,
    spreadLockedAt: null
  };
}

function hasGameStarted(game, now) {
  const commenceTime = new Date(game.commenceTime);
  return !Number.isNaN(commenceTime.getTime()) && commenceTime <= now;
}

function hasSpread(game) {
  const homeSpread = game.spreads?.[game.homeTeam];
  const awaySpread = game.spreads?.[game.awayTeam];
  return Number.isFinite(homeSpread) && Number.isFinite(awaySpread) && homeSpread + awaySpread === 0;
}
