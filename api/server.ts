import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import {
  getStartggApiKey,
  getScoreboardSettings,
  getTournamentSlug,
  readConfig,
  saveConfig,
} from "./services/config";
import {
  DEFAULT_SCOREBOARD_SETTINGS,
  parseScoreboardSettings,
} from "./core/scoreboardSettings";
import { isMatchNotNull } from "./core/types";
import { assignStreamToSet } from "./services/assignStream";
import { startSetOnStartGG } from "./services/startMatch";
import { getSets } from "./services/getSets";
import { saveScoresToStartGG } from "./services/saveResult";
import { mapSetToMatch } from "./services/mapToMatch";
import { store } from "./core/store";
import { draftStore } from "./core/draftStore";
import { createStreamDeckRouter } from "./routes/streamdeck";
import { createDraftRouter } from "./routes/draft";

import type { Match, TournamentStream } from "./core/types";
import { getTournamentStreams } from "./services/getStreams";
import { finalSubmitResultToStartGG } from "./services/submitResult";
import { listenOnAvailablePort } from "./services/listenOnAvailablePort";

let streams: TournamentStream[] = [];
type AppMode = "startgg" | "offline";
let appMode: AppMode | null = null;
const OFFLINE_MATCH_ID = "offline-match";
const OFFLINE_STREAM: TournamentStream = {
  id: "offline",
  name: "Offline Scoreboard",
  source: null,
};

const app = express();
let broadcastAppState = () => {};

function getAppState() {
  return {
    mode: appMode,
    matchesData: store.getState(),
    streamsData: streams,
  };
}

const logPath = path.join(
  (process as any).pkg ? path.dirname(process.execPath) : process.cwd(),
  "app.log",
);

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line);
  console.log(message);
}

app.use(cors({ origin: true }));

app.use(express.json());

// ── Static assets (registered before SPA catch-all) ──────────────────────

const apiRoot = (process as any).pkg
  ? path.dirname(process.execPath)
  : path.basename(__dirname) === "dist"
    ? path.join(__dirname, "..")
    : __dirname;

const publicBase = path.join(apiRoot, "public");
const assetsBase = path.join(apiRoot, "assets");
const configBase = path.join(apiRoot, "config");

app.use("/scoreboard", express.static(path.join(publicBase, "scoreboard")));
app.use("/draft-overlay", express.static(path.join(publicBase, "draft-overlay")));
app.use("/assets", express.static(assetsBase));

function getPublicUrls(req: express.Request) {
  const origin = `${req.protocol}://${req.get("host")}`;

  return {
    scoreboard: `${origin}/scoreboard`,
    draftController: `${origin}/draft`,
    draftOverlay: `${origin}/draft-overlay`,
  };
}

app.get("/config", (req, res) => {
  res.json({
    hasStartggToken: Boolean(getStartggApiKey()),
    hasTournamentSlug: Boolean(getTournamentSlug()),
    tournamentSlug: getTournamentSlug(),
    scoreboard: getScoreboardSettings(),
    scoreboardDefaults: DEFAULT_SCOREBOARD_SETTINGS,
    urls: getPublicUrls(req),
  });
});

app.get("/settings", (_req, res) => {
  res.json({
    hasStartggToken: Boolean(getStartggApiKey()),
    scoreboard: getScoreboardSettings(),
    scoreboardDefaults: DEFAULT_SCOREBOARD_SETTINGS,
  });
});

app.get("/app-state", (_req, res) => {
  res.json(getAppState());
});

function normalizeTournamentSlug(value: string) {
  const trimmed = value.trim();
  const tournamentPath = trimmed.match(/(?:^|\/)tournament\/([^/?#]+)/i);

  if (tournamentPath) {
    return `tournament/${tournamentPath[1]}`;
  }

  return trimmed.replace(/^\/+|\/+$/g, "");
}

app.post("/config", (req, res) => {
  const { STARTGG_API_TOKEN, TOURNAMENT_SLUG } = req.body;

  if (
    STARTGG_API_TOKEN !== undefined &&
    typeof STARTGG_API_TOKEN !== "string"
  ) {
    return res.status(400).json({
      error: "STARTGG_API_TOKEN must be a string",
    });
  }

  if (!TOURNAMENT_SLUG || typeof TOURNAMENT_SLUG !== "string") {
    return res.status(400).json({
      error: "TOURNAMENT_SLUG is required",
    });
  }

  const token = STARTGG_API_TOKEN?.trim();
  if (!token && !getStartggApiKey()) {
    return res.status(400).json({
      error: "STARTGG_API_TOKEN is required",
    });
  }

  const currentConfig = readConfig();
  saveConfig({
    ...currentConfig,
    ...(token ? { STARTGG_API_TOKEN: token } : {}),
    TOURNAMENT_SLUG: normalizeTournamentSlug(TOURNAMENT_SLUG),
  });

  res.json({ ok: true });
});

// ── HTTP server + Socket.io (created early so routers can reference io) ────

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  transports: ["websocket", "polling"],
});

broadcastAppState = () => {
  io.emit("app:state", getAppState());
};

function persistScoreboardSettings(value: unknown) {
  const scoreboard = parseScoreboardSettings(value);
  const currentConfig = readConfig();

  saveConfig({
    ...currentConfig,
    SCOREBOARD_SETTINGS: scoreboard,
  });
  io.emit("scoreboard:settings", scoreboard);

  return scoreboard;
}

app.post("/settings/scoreboard", (req, res) => {
  try {
    return res.json({
      scoreboard: persistScoreboardSettings(req.body.scoreboard),
    });
  } catch (error) {
    return res.status(400).json({
      error:
        error instanceof Error ? error.message : "Invalid scoreboard settings",
    });
  }
});

app.post("/settings/startgg-token", (req, res) => {
  const { startggApiToken } = req.body;

  if (typeof startggApiToken !== "string" || !startggApiToken.trim()) {
    return res.status(400).json({
      error: "startggApiToken is required",
    });
  }

  const currentConfig = readConfig();
  saveConfig({
    ...currentConfig,
    STARTGG_API_TOKEN: startggApiToken.trim(),
  });

  return res.json({ hasStartggToken: true });
});

app.post("/settings", (req, res) => {
  const { startggApiToken, scoreboard } = req.body;

  if (
    startggApiToken !== undefined &&
    typeof startggApiToken !== "string"
  ) {
    return res.status(400).json({
      error: "startggApiToken must be a string",
    });
  }

  try {
    const token = startggApiToken?.trim();
    const nextScoreboardSettings = persistScoreboardSettings(scoreboard);

    if (token) {
      const currentConfig = readConfig();
      saveConfig({
        ...currentConfig,
        STARTGG_API_TOKEN: token,
      });
    }

    return res.json({
      hasStartggToken: Boolean(token || getStartggApiKey()),
      scoreboard: nextScoreboardSettings,
    });
  } catch (error) {
    return res.status(400).json({
      error:
        error instanceof Error ? error.message : "Invalid scoreboard settings",
    });
  }
});

// ── Emit match state on every store change ────────────────────────────────

store.subscribe((state) => {
  io.emit("match:update", state);
  broadcastAppState();
});

// ── Draft + Stream Deck routes ────────────────────────────────────────────

const { router: streamDeckRouter, getDisplayState } =
  createStreamDeckRouter(io);
app.use("/streamdeck", streamDeckRouter);

const isProd = (process as any).pkg || process.env.IS_PROD === "true";
const webDistPath = path.join(__dirname, "../../web/dist");
const draftRouter = createDraftRouter(io);

app.use("/api/draft", draftRouter);

if (isProd) {
  app.get("/draft", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
}

// Preserve the existing POST endpoints for Stream Decks and other integrations.
app.use("/draft", draftRouter);

// ── Send current state to newly connected clients ─────────────────────────

io.on("connection", (socket) => {
  socket.emit("app:state", getAppState());
  socket.emit("scoreboard:display", getDisplayState());
  socket.emit("scoreboard:settings", getScoreboardSettings());
  socket.emit("match:update", store.getState());
  socket.emit("draft:update", draftStore.getState());
});

// ── React SPA (prod only — must come AFTER specific routes) ───────────────

if (isProd) {
  app.use(express.static(webDistPath));
}

async function bootstrap() {
  if (!getStartggApiKey() || !getTournamentSlug()) {
    log("Start.gg token or tournament slug missing. Skipping initial refresh.");
    return;
  }
}

async function refreshFromStartGG() {
  const slug = getTournamentSlug();

  if (!slug) {
    throw new Error("TOURNAMENT_SLUG is required");
  }

  const sets = await getSets(slug);
  const matches = sets.map(mapSetToMatch).filter(isMatchNotNull);

  const freshStreams = await getTournamentStreams(slug);

  appMode = "startgg";
  streams = freshStreams;
  store.mergeFromStartGG(matches);
  // Emit updated match state to all connected clients
  io.emit("match:update", store.getState());
  broadcastAppState();

  log(`Refreshed ${matches.length} matches`);
  log(`Refreshed ${freshStreams.length} streams`);

  return {
    matchesData: matches,
    streamsData: freshStreams,
  };
}

app.get("/matches", (req, res) => {
  res.json(store.getState());
});

app.get("/streams", (req, res) => {
  res.json(streams);
});

app.post("/offline", (req, res) => {
  const player1Name =
    typeof req.body.player1Name === "string" ? req.body.player1Name.trim() : "";
  const player2Name =
    typeof req.body.player2Name === "string" ? req.body.player2Name.trim() : "";
  const matchLabel =
    typeof req.body.matchLabel === "string" ? req.body.matchLabel.trim() : "";

  if (!player1Name || !player2Name) {
    return res.status(400).json({
      error: "player1Name and player2Name are required",
    });
  }

  const match: Match = {
    id: OFFLINE_MATCH_ID,
    round: matchLabel || "Offline Match",
    player1: { id: "offline-player-1", name: player1Name },
    player2: { id: "offline-player-2", name: player2Name },
    score1: 0,
    score2: 0,
    streamId: OFFLINE_STREAM.id,
    startggStreamId: null,
    status: "live",
    updatedAt: Date.now(),
  };

  appMode = "offline";
  streams = [OFFLINE_STREAM];
  store.dispatch({
    type: "OFFLINE_MATCH_CONFIGURED",
    matchId: match.id,
    match,
  });

  return res.json({
    matchesData: store.getState(),
    streamsData: streams,
  });
});

app.post("/offline/update", (req, res) => {
  const match = store.getState()[OFFLINE_MATCH_ID];
  const player1Name =
    typeof req.body.player1Name === "string" ? req.body.player1Name.trim() : "";
  const player2Name =
    typeof req.body.player2Name === "string" ? req.body.player2Name.trim() : "";
  const matchLabel =
    typeof req.body.matchLabel === "string" ? req.body.matchLabel.trim() : "";

  if (!match || match.streamId !== OFFLINE_STREAM.id) {
    return res.status(404).json({ error: "Offline match not found" });
  }

  if (!player1Name || !player2Name || !matchLabel) {
    return res.status(400).json({
      error: "player1Name, player2Name, and matchLabel are required",
    });
  }

  store.dispatch({
    type: "OFFLINE_MATCH_DETAILS_UPDATED",
    matchId: match.id,
    player1Name,
    player2Name,
    matchLabel,
  });

  return res.json(store.getState()[match.id]);
});

app.post("/assign", (req, res) => {
  const { matchId, streamId } = req.body;

  if (!matchId || !streamId) {
    return res.status(400).json({
      error: "matchId and streamId are required",
    });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({
      error: "Match not found",
    });
  }

  const streamExists = streams.some((stream) => stream.id === streamId);

  if (!streamExists) {
    return res.status(400).json({
      error: "Invalid streamId",
    });
  }

  if (match.status === "complete") {
    return res.status(409).json({
      error: `Match cannot be assigned from status: ${match.status}`,
    });
  }

  store.dispatch({
    type: "MATCH_ASSIGNED",
    matchId,
    streamId,
  });

  if (match.startggStreamId !== streamId) {
    void assignStreamToSet(matchId, streamId).catch((err) => {
      log(`Failed to sync stream assignment to start.gg: ${err}`);
    });
  }

  return res.json(store.getState()[matchId]);
});

app.post("/unassign", (req, res) => {
  const { matchId } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  store.dispatch({
    type: "MATCH_UNASSIGNED",
    matchId,
  });

  return res.json(store.getState()[matchId]);
});

app.post("/start", (req, res) => {
  const { matchId } = req.body;
  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.status !== "assigned") {
    return res.status(409).json({
      error: `Match cannot be started from status: ${match.status}`,
    });
  }

  store.dispatch({
    type: "MATCH_STARTED",
    matchId,
  });

  void startSetOnStartGG(matchId).catch((err: any) => {
    log(`Failed to sync in-progress state to start.gg: ${err.response ?? err}`);
  });

  return res.json(store.getState()[matchId]);
});

app.post("/updateScoreLocal", (req, res) => {
  const { matchId, score1, score2 } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.status === "complete") {
    return res.status(409).json({
      error: `Cannot update score from status: ${match.status}`,
    });
  }

  store.dispatch({
    type: "SCORE_UPDATED",
    matchId,
    score1,
    score2,
  });

  return res.json(store.getState()[matchId]);
});

app.post("/resetScore", (req, res) => {
  const { matchId } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.status === "complete") {
    return res.status(409).json({
      error: `Cannot reset score from status: ${match.status}`,
    });
  }

  store.dispatch({
    type: "SCORE_UPDATED",
    matchId,
    score1: 0,
    score2: 0,
  });

  return res.json(store.getState()[matchId]);
});

app.post("/saveResult", async (req, res) => {
  const { matchId } = req.body;

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.status === "complete") {
    return res.status(409).json({
      error: `Cannot save result from status: ${match.status}`,
    });
  }

  try {
    await saveScoresToStartGG(match);

    store.dispatch({
      type: "MATCH_RESULT_SAVED",
      matchId,
    });

    return res.json(store.getState()[matchId]);
  } catch (err: any) {
    log(`Failed to save result:" ${err.response ?? err}`);

    return res.status(502).json({
      error: "Failed to save result to start.gg",
      details: err.response?.errors ?? err.message,
    });
  }
});

app.post("/submitFinal", async (req, res) => {
  const { matchId } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.status !== "live" && match.status !== "saved") {
    return res.status(409).json({
      error: `Cannot submit final result from status: ${match.status}`,
    });
  }

  if (match.score1 === match.score2) {
    return res.status(400).json({
      error: "Cannot submit a tied result",
    });
  }

  try {
    await finalSubmitResultToStartGG(match);

    store.dispatch({
      type: "MATCH_COMPLETED",
      matchId,
    });

    return res.json(store.getState()[matchId]);
  } catch (err: any) {
    log(`Failed to submit final result: ${err.response ?? err}`);

    return res.status(502).json({
      error: "Failed to submit final result to start.gg",
      details: err.response?.errors ?? err.message,
    });
  }
});

app.post("/refresh", async (req, res) => {
  try {
    const result = await refreshFromStartGG();

    res.json({
      success: true,
      ...result,
      matchesData: store.getState(),
      streamsData: result.streamsData,
    });
  } catch (err: any) {
    log(`Refresh failed: ${err.response ?? err}`);

    res.status(500).json({
      success: false,
      error: "Failed to refresh from start.gg",
      details: err.response?.errors ?? err.message,
    });
  }
});

if (isProd) {
  // Exclude API, socket, scoreboard, draft-overlay, assets paths from catch-all
  app.get(/^(?!\/socket\.io|\/api|\/scoreboard|\/draft-overlay|\/assets|\/streamdeck|\/draft).*/, (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
}

const configuredPort = Number(process.env.PORT);
const preferredPort =
  Number.isInteger(configuredPort) && configuredPort >= 0
    ? configuredPort
    : 3001;

export const serverReady = bootstrap().then(async () => {
  const port = await listenOnAvailablePort(
    server,
    preferredPort,
    "0.0.0.0",
    (conflictingPort) => {
      log(
        `Port ${conflictingPort} is already in use. Selecting an available port.`,
      );
    },
  );

  log(`Server running on http://localhost:${port}`);
  return port;
});
