# OBS Start.gg Bracket Reporter

A tournament management platform for livestreamed events. Replaces TournamentStreamHelper with a purpose-built Electron app that communicates with the [start.gg](https://start.gg) API and provides real-time browser overlays for OBS.

## Features

- **Bracket Manager** — Electron desktop app (React/Vite) for managing tournament sets: assign matches to streams, track scores, and submit results to start.gg.
- **Offline Scoreboard Mode** — Enter two player names and use the score controls, OBS overlay, and Stream Deck endpoints without a start.gg tournament.
- **Scoreboard Overlay** — Browser source for OBS; auto-updates via WebSocket when scores or players change.
- **Character Draft Overlay** — Browser source for OBS; displays a live ban/pick draft for team-format matches.
- **Stream Deck Integration** — HTTP endpoints (GET or POST) for hardware controllers to adjust scores and toggle scoreboard visibility.
- **Multi-instance Sync** — All open bracket manager windows stay in sync in real time via Socket.io; the backend is the single source of truth.

---

## Architecture

```
obs-startgg-bracket-reporter/
├── api/          Node/Express/Socket.io backend + static overlay pages
├── web/          React/Vite bracket manager frontend (served by Electron)
├── electron/     Electron shell (loads api server + web UI)
└── assets/       App icons and shared assets
```

- **Backend** runs on `http://localhost:3001`
- **Bracket manager** runs on `http://localhost:5173` in dev and is served by the backend inside Electron in production
- **Draft controller**: `http://localhost:5173/draft` in dev or `http://localhost:3001/draft` in production
- **Scoreboard overlay**: `http://localhost:3001/scoreboard`
- **Draft overlay**: `http://localhost:3001/draft-overlay`

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [start.gg](https://start.gg) developer API token when using tournament mode

### Install

```bash
npm run install:all
```

### Development

Run the API server and web frontend together:

```bash
npm run dev
```

Development requires API port `3001` to be free. If API startup fails, this command
also stops the web frontend instead of connecting it to another running instance.
Restart the command after API code changes; for API-only watch mode, use
`npm run dev:api` separately. Packaged/production instances still select an available
port when their preferred port is occupied.

Then open `http://localhost:5173` in a browser for the bracket manager, or launch the Electron app.

To use the Electron window during development, leave `npm run dev` running and
launch this in a second terminal:

```bash
npm run dev:electron
```

### Production Build

```bash
npm run build
```

### Package (portable Windows executable)

```bash
npm run dist:portable
```

Outputs a standalone portable executable to `release/`.

If Windows blocks `electron-builder` while extracting symbolic links, enable
Windows Developer Mode or run the build from an elevated terminal.

Pushing a version tag such as `v1.2.0` runs the GitHub Actions release workflow,
builds the portable executable, and attaches it to a GitHub release.

---

## Configuration

On launch, choose start.gg tournament mode or offline mode. Tournament mode accepts a numeric tournament ID, slug (for example `tournament/my-event`), or tournament URL. The API token and tournament identifier are persisted to `api/config.json`.

To configure the character draft ruleset (ban/pick order, roster), edit `api/config/ruleset.json`. See [Ruleset Format](#ruleset-format) below.

---

## OBS Setup

Add the following as **Browser Sources** in OBS:

| Source | URL |
|---|---|
| Scoreboard | `http://localhost:3001/scoreboard` |
| Draft Overlay | `http://localhost:3001/draft-overlay` |

Both pages connect to the backend via WebSocket and update automatically.

---

## API Reference

All endpoints are on `http://localhost:3001`.

### Match Management

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/matches` | — | All matches in backend state |
| `GET` | `/streams` | — | Tournament streams from start.gg |
| `POST` | `/refresh` | — | Pull latest sets from start.gg (preserves local scores) |
| `POST` | `/offline` | `{ player1Name, player2Name, matchLabel? }` | Create/reset the active offline scoreboard match |
| `POST` | `/offline/update` | `{ player1Name, player2Name, matchLabel }` | Update offline names and label without resetting scores |
| `POST` | `/assign` | `{ matchId, streamId }` | Select a match for the local scoreboard and asynchronously sync its stream to start.gg |
| `POST` | `/unassign` | `{ matchId }` | Clear a match from the local scoreboard without changing its start.gg stream assignment |
| `POST` | `/start` | `{ matchId }` | Mark a match live locally and asynchronously sync its in-progress state to start.gg |
| `POST` | `/updateScoreLocal` | `{ matchId, score1, score2 }` | Update scores in backend only |
| `POST` | `/resetScore` | `{ matchId }` | Reset both match scores to zero |
| `POST` | `/saveResult` | `{ matchId }` | Push current scores to start.gg |
| `POST` | `/submitFinal` | `{ matchId }` | Report final result and mark complete |

### Configuration

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/config` | — | Check if token/slug are configured |
| `POST` | `/config` | `{ STARTGG_API_TOKEN, TOURNAMENT_SLUG }` | Save configuration |
| `POST` | `/settings/scoreboard` | `{ scoreboardPatch }` | Merge changed settings fields into the current configuration; returns `scoreboard` and `scoreboardRevision`. A full `{ scoreboard }` replacement is also supported. |

### Stream Deck Endpoints

All Stream Deck endpoints accept **GET or POST**. Pass `streamId` as a query param or JSON body field to target a specific stream; omit it to target the match explicitly selected for the local scoreboard.

| Path | Description |
|---|---|
| `/streamdeck/p1/score/up` | Increment the player shown on the P1/left side |
| `/streamdeck/p1/score/down` | Decrement the player shown on the P1/left side |
| `/streamdeck/p2/score/up` | Increment the player shown on the P2/right side |
| `/streamdeck/p2/score/down` | Decrement the player shown on the P2/right side |
| `/streamdeck/score/reset` | Reset both scores to zero |
| `/streamdeck/swap` | Swap player sides and their P1/P2 score control assignments |
| `/streamdeck/scoreboard/show` | Show scoreboard overlay |
| `/streamdeck/scoreboard/hide` | Hide scoreboard overlay |
| `/streamdeck/display` | Get current display state |

### Draft Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/draft` | — | Current draft state |
| `POST` | `/api/draft/start` | `{ team1Name, team2Name }` | Start a new draft (enters RPS phase) |
| `POST` | `/api/draft/rps-winner` | `{ winner: 1 \| 2 }` | Record RPS winner; begins ban phase |
| `POST` | `/api/draft/stage` | `{ codenames, action }` | Preview the current selection on the overlay |
| `POST` | `/api/draft/lock-in` | `{ codenames }` | Confirm the current selection |
| `POST` | `/api/draft/ban` | `{ codename }` | Ban a character |
| `POST` | `/api/draft/pick` | `{ codename }` | Pick a character |
| `POST` | `/api/draft/undo` | — | Undo last ban/pick |
| `POST` | `/api/draft/redo` | — | Redo last undone action |
| `POST` | `/api/draft/restart` | — | Reset draft to team name entry |

---

## WebSocket Events

Connect to `http://localhost:3001` with Socket.io. On connection the server immediately emits current state.

| Event | Direction | Payload | Description |
|---|---|---|---|
| `match:update` | server → client | `Record<string, Match>` | Full match state; emitted on every change |
| `draft:update` | server → client | `DraftState` | Full draft state; emitted on every change |
| `scoreboard:display` | server → client | `Record<string, { visible, swapped }>` | Display state per stream |
| `scoreboard:settings` | server → client | `ScoreboardSettings, scoreboardRevision` | Full settings plus a revision argument for ordering concurrent updates |

---

## Match Status Lifecycle

```
idle → assigned → live → saved → complete
              ↑___________|
              (can re-assign after unassign)
```

- **idle** — known to the system but not on stream
- **assigned** — assigned to a stream, not yet started
- **live** — actively in progress
- **saved** — result recorded locally, not yet submitted to start.gg
- **complete** — final result submitted; cannot be modified

The backend preserves the locally selected scoreboard match, scores, and status across start.gg refreshes. A set's stream assignment or in-progress state on start.gg never selects it for the local scoreboard.

---

## Ruleset Format

`api/config/ruleset.json` controls the character draft:

```jsonc
{
  "name": "SF3TS 3v3",
  "teamSize": 3,
  "banOrder": [0, 1, 1, 0],      // 0 = team1, 1 = team2
  "pickOrder": [0, 1, 1, 0, 0, 1],
  "characters": [
    {
      "codename": "Ryu",
      "displayName": "Ryu",
      "imagePath": "/assets/characters/sf3ts/Ryu.png",
      "portraitOffset": 0   // optional; % of portrait height. negative = more overlap, positive = more gap
    }
    // ...
  ]
}
```

Character images must be placed in `api/assets/characters/<game>/`.

---

## Development Notes

- The backend store (`api/core/store.ts`) is the source of truth for all match state. The start.gg API is only consulted on explicit refresh.
- Socket.io broadcasts `match:update` on every `store.dispatch()` call automatically via a store subscriber.
- In development, the web frontend runs on port 5173 (Vite) and the API on 3001. CORS is configured to allow both origins.
- Logs are written to `api/app.log` alongside the binary in production.
