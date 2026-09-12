# RATS 2026

Automated dashboard for a league where each member is randomly assigned one NFL team and standings are based on that team's regular-season record against the spread.

## Run locally

```powershell
cd "C:\Users\jeschwartz\OneDrive - Microsoft\Documents\Microsoft Scout\nfl-pickem-ats-dashboard"
Copy-Item .env.example .env
notepad .env
npm start
```

Open `http://localhost:3000`. The app starts with no game results; standings populate after a successful API sync.

## Configure the league

Edit `data\league.json`:

```json
{
  "season": 2026,
  "members": [
    { "id": "alex", "name": "Alex", "team": "KC" }
  ]
}
```

Use the NFL team abbreviations in `src\teams.js`.

## Pull spreads and scores

This starter uses [The Odds API](https://the-odds-api.com/) for spreads and scores. Add your key to `.env`:

```powershell
ODDS_API_KEY=your_key
BOOKMAKER=draftkings
REGULAR_SEASON_START_DATE=2026-09-10T00:00:00Z
```

Sync once:

```powershell
npm run sync
```

When the server is running, it also exposes:

- `GET /api/dashboard` for dashboard data
- `POST /api/sync` to pull latest odds and scores
- `GET /api/config` to check current API settings

By default, the server syncs every 15 minutes when `ODDS_API_KEY` is set. Before the regular season starts, sync pulls Week 1. After kickoff week, sync pulls the current regular-season week and keeps prior weeks in `data\games.json`.

Spreads are treated as closing lines. Each sync updates the spread before kickoff. Once a game starts, the app locks the most recent synced spread for that game and will not overwrite it later. For the closest approximation to the true closing line, run sync frequently before game windows, such as every 5-15 minutes on game days.

## Manual line corrections

If a synced line is wrong, add or edit an entry in `data\line-overrides.json`. Overrides are applied on the dashboard and after every sync, so they survive redeploys and cannot be overwritten by the API.

```json
{
  "week": 1,
  "homeTeam": "Seattle Seahawks",
  "awayTeam": "New England Patriots",
  "spreads": {
    "Seattle Seahawks": -3,
    "New England Patriots": 3
  },
  "note": "Manual closing line correction"
}
```

## ATS rule

For each assigned team:

```text
ATS margin = team score - opponent score + spread
```

- Greater than 0: ATS win
- Less than 0: ATS loss
- Exactly 0: push

The spread is captured in `data\games.json` during sync. Once kickoff passes, that captured spread is locked for standings calculations.
