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
  patchScoreboardSettings,
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
let scoreboardRevision = 0;
type AppMode = "startgg" | "offline";
let appMode: AppMode | null = null;
const OFFLINE_MATCH_ID = "offline-match";

function parseOptionalText(
  value: unknown,
  field: string,
  maximumLength: number,
) {
  if (value === undefined || value === null || value === "") {
    return { value: null as string | null };
  }
  if (typeof value !== "string") {
    return { value: null, error: `${field} must be a string` };
  }

  const trimmed = value.trim();
  if (!trimmed) return { value: null as string | null };
  if (trimmed.length > maximumLength) {
    return {
      value: null,
      error: `${field} must be at most ${maximumLength} characters`,
    };
  }

  return { value: trimmed };
}

function parseOptionalCountry(value: unknown, field: string) {
  const parsed = parseOptionalText(value, field, 2);
  if (parsed.error || !parsed.value) return parsed;

  const country = parsed.value.toUpperCase();
  return /^[A-Z]{2}$/.test(country)
    ? { value: country }
    : { value: null, error: `${field} must be a two-letter country code` };
}

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

const streamAssignmentQueues = new Map<string, Promise<void>>();

function queueStartggStreamAssignment(matchId: string, streamId: string) {
  const previous = streamAssignmentQueues.get(matchId) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .then(async () => {
      await assignStreamToSet(matchId, streamId);
      store.dispatch({
        type: "STARTGG_STREAM_UPDATED",
        matchId,
        streamId,
      });
    })
    .catch((err) => {
      log(`Failed to sync stream assignment to start.gg: ${err}`);
    })
    .finally(() => {
      if (streamAssignmentQueues.get(matchId) === next) {
        streamAssignmentQueues.delete(matchId);
      }
    });
  streamAssignmentQueues.set(matchId, next);
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
const countryFlagFontBase = path.join(
  apiRoot,
  "node_modules",
  "country-flag-emoji-polyfill",
  "dist",
);

app.use("/fonts/country-flags", express.static(countryFlagFontBase));
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
    scoreboardRevision,
    scoreboardDefaults: DEFAULT_SCOREBOARD_SETTINGS,
    urls: getPublicUrls(req),
  });
});

app.get("/settings", (_req, res) => {
  res.json({
    hasStartggToken: Boolean(getStartggApiKey()),
    scoreboard: getScoreboardSettings(),
    scoreboardRevision,
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

function persistScoreboardSettings(value: unknown, patch?: unknown) {
  const scoreboard = patch === undefined
    ? parseScoreboardSettings(value)
    : patchScoreboardSettings(getScoreboardSettings(), patch);
  const currentConfig = readConfig();

  saveConfig({
    ...currentConfig,
    SCOREBOARD_SETTINGS: scoreboard,
  });
  scoreboardRevision += 1;
  io.emit("scoreboard:settings", scoreboard, scoreboardRevision);

  return scoreboard;
}

app.post("/settings/scoreboard", (req, res) => {
  try {
    return res.json({
      scoreboard: persistScoreboardSettings(
        req.body.scoreboard,
        req.body.scoreboardPatch,
      ),
      scoreboardRevision,
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
      scoreboardRevision,
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
  socket.emit("scoreboard:settings", getScoreboardSettings(), scoreboardRevision);
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
  const player1Sponsor = parseOptionalText(
    req.body.player1Sponsor,
    "player1Sponsor",
    100,
  );
  const player2Sponsor = parseOptionalText(
    req.body.player2Sponsor,
    "player2Sponsor",
    100,
  );
  const player1Country = parseOptionalCountry(
    req.body.player1Country,
    "player1Country",
  );
  const player2Country = parseOptionalCountry(
    req.body.player2Country,
    "player2Country",
  );

  if (!player1Name || !player2Name) {
    return res.status(400).json({
      error: "player1Name and player2Name are required",
    });
  }
  const metadataError =
    player1Sponsor.error ||
    player2Sponsor.error ||
    player1Country.error ||
    player2Country.error;
  if (metadataError) {
    return res.status(400).json({ error: metadataError });
  }

  const match: Match = {
    id: OFFLINE_MATCH_ID,
    round: matchLabel || "Offline Match",
    player1: {
      id: "offline-player-1",
      name: player1Name,
      sponsor: player1Sponsor.value,
      country: player1Country.value,
    },
    player2: {
      id: "offline-player-2",
      name: player2Name,
      sponsor: player2Sponsor.value,
      country: player2Country.value,
    },
    score1: 0,
    score2: 0,
    isScoreboardMatch: true,
    startggStreamId: null,
    status: "live",
    updatedAt: Date.now(),
  };

  appMode = "offline";
  streams = [];
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
  const player1Sponsor = parseOptionalText(
    req.body.player1Sponsor,
    "player1Sponsor",
    100,
  );
  const player2Sponsor = parseOptionalText(
    req.body.player2Sponsor,
    "player2Sponsor",
    100,
  );
  const player1Country = parseOptionalCountry(
    req.body.player1Country,
    "player1Country",
  );
  const player2Country = parseOptionalCountry(
    req.body.player2Country,
    "player2Country",
  );

  if (!match) {
    return res.status(404).json({ error: "Offline match not found" });
  }

  if (!player1Name || !player2Name || !matchLabel) {
    return res.status(400).json({
      error: "player1Name, player2Name, and matchLabel are required",
    });
  }
  const metadataError =
    player1Sponsor.error ||
    player2Sponsor.error ||
    player1Country.error ||
    player2Country.error;
  if (metadataError) {
    return res.status(400).json({ error: metadataError });
  }

  store.dispatch({
    type: "OFFLINE_MATCH_DETAILS_UPDATED",
    matchId: match.id,
    player1Name,
    player1Sponsor: player1Sponsor.value,
    player1Country: player1Country.value,
    player2Name,
    player2Sponsor: player2Sponsor.value,
    player2Country: player2Country.value,
    matchLabel,
  });

  return res.json(store.getState()[match.id]);
});

app.post("/assign", (req, res) => {
  const { matchId, streamId } = req.body;

  if (!matchId) {
    return res.status(400).json({
      error: "matchId is required",
    });
  }

  const match = store.getState()[matchId];

  if (!match) {
    return res.status(404).json({
      error: "Match not found",
    });
  }

  const selectedStreamId =
    typeof streamId === "string" && streamId.trim() ? streamId.trim() : null;
  const streamExists =
    !selectedStreamId ||
    streams.some((stream) => stream.id === selectedStreamId);

  if (!streamExists) {
    return res.status(400).json({
      error: "Invalid streamId",
    });
  }

  if (match.status === "complete") {
    return res.status(409).json({
      error: `Match cannot be shown from status: ${match.status}`,
    });
  }

  store.dispatch({
    type: "SCOREBOARD_MATCH_SELECTED",
    matchId,
  });

  if (match.status === "idle") {
    store.dispatch({
      type: "MATCH_STARTED",
      matchId,
    });
    void startSetOnStartGG(matchId).catch((err: any) => {
      log(`Failed to sync in-progress state to start.gg: ${err.response ?? err}`);
    });
  }

  if (selectedStreamId && match.startggStreamId !== selectedStreamId) {
    queueStartggStreamAssignment(matchId, selectedStreamId);
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
    type: "SCOREBOARD_MATCH_CLEARED",
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

  if (match.status !== "idle") {
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

app.post("/updateScoreDelta", (req, res) => {
  const { matchId, player, delta } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "matchId is required" });
  }
  if ((player !== 1 && player !== 2) || (delta !== -1 && delta !== 1)) {
    return res.status(400).json({
      error: "player must be 1 or 2 and delta must be -1 or 1",
    });
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
    score1:
      player === 1 ? Math.max(0, match.score1 + delta) : match.score1,
    score2:
      player === 2 ? Math.max(0, match.score2 + delta) : match.score2,
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
  app.get(/^(?!\/socket\.io|\/api|\/scoreboard(?:\/|$)|\/draft-overlay|\/assets|\/streamdeck|\/draft).*/, (_req, res) => {
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
    Boolean(isProd),
  );

  log(`Server running on http://localhost:${port}`);
  return port;
});
