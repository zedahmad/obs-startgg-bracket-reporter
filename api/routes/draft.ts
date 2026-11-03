import { Router } from "express";
import path from "path";
import fs from "fs";
import { draftStore } from "../core/draftStore";
import { DraftRuleset } from "../core/draftTypes";
import { Server } from "socket.io";
import type { Match } from "../core/types";

type DraftMatchOperations = {
  prepareMatch: (matchId: string, streamId?: unknown) => Match;
  adjustScore: (
    matchId: string,
    player: 1 | 2,
    delta: -1 | 1,
  ) => Match;
};

function errorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return 500;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function getRulesetPath(): string {
  if ((process as any).pkg) return path.join(path.dirname(process.execPath), "config", "ruleset.json");
  // __dirname = api/routes (ts-node) or api/dist/routes (compiled)
  const parent = path.resolve(__dirname, "..");
  const apiRoot = path.basename(parent) === "dist" ? path.resolve(parent, "..") : parent;
  return path.join(apiRoot, "config", "ruleset.json");
}

function loadRuleset(): DraftRuleset {
  const configPath = getRulesetPath();
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as DraftRuleset;
}

export function createDraftRouter(
  io: Server,
  matchOperations: DraftMatchOperations,
) {
  const router = Router();

  draftStore.subscribe(() => {
    io.emit("draft:update", draftStore.getState());
  });

  // GET /draft — current draft state
  router.get("/", (_req, res) => {
    return res.json(draftStore.getState());
  });

  // POST /draft/start — select/start a match and begin a linked draft
  router.post("/start", (req, res) => {
    const { matchId, streamId } = req.body ?? {};
    if (typeof matchId !== "string" || !matchId.trim()) {
      return res.status(400).json({ error: "matchId is required" });
    }

    try {
      const ruleset = loadRuleset();
      const match = matchOperations.prepareMatch(matchId.trim(), streamId);
      draftStore.start(
        ruleset,
        match.id,
        match.player1.name,
        match.player2.name,
      );
      return res.json({
        draft: draftStore.getState(),
        match,
      });
    } catch (error) {
      return res.status(errorStatus(error)).json({
        error: errorMessage(error),
      });
    }
  });

  // POST /draft/defeat — toggle a drafted character and adjust opponent score
  router.post("/defeat", (req, res) => {
    const { team, codename } = req.body ?? {};
    if ((team !== 0 && team !== 1) || typeof codename !== "string") {
      return res.status(400).json({
        error: "team must be 0 or 1 and codename is required",
      });
    }

    const state = draftStore.getState();
    if (!state.matchId) {
      return res.status(409).json({ error: "No match is linked to the draft" });
    }

    const becameDefeated = draftStore.toggleDefeated(team, codename);
    if (becameDefeated === null) {
      return res.status(409).json({
        error: "Only drafted characters can be toggled after the draft is complete",
      });
    }

    try {
      const match = matchOperations.adjustScore(
        state.matchId,
        team === 0 ? 2 : 1,
        becameDefeated ? 1 : -1,
      );
      return res.json({
        draft: draftStore.getState(),
        match,
      });
    } catch (error) {
      draftStore.toggleDefeated(team, codename);
      return res.status(errorStatus(error)).json({
        error: errorMessage(error),
      });
    }
  });

  // POST /draft/rps-winner — record who won RPS; body: { winner: 1 | 2 }
  router.post("/rps-winner", (req, res) => {
    const { winner } = req.body ?? {};
    if (winner !== 1 && winner !== 2) {
      return res.status(400).json({ error: "winner must be 1 or 2" });
    }
    draftStore.setRpsWinner(winner as 1 | 2);
    return res.json(draftStore.getState());
  });

  // POST /draft/ban — ban a character; body: { codename }
  router.post("/ban", (req, res) => {
    const { codename } = req.body ?? {};
    if (!codename) return res.status(400).json({ error: "codename is required" });
    const ok = draftStore.ban(codename);
    if (!ok) return res.status(409).json({ error: "Invalid ban" });
    return res.json(draftStore.getState());
  });

  // POST /draft/pick — pick a character; body: { codename }
  router.post("/pick", (req, res) => {
    const { codename } = req.body ?? {};
    if (!codename) return res.status(400).json({ error: "codename is required" });
    const ok = draftStore.pick(codename);
    if (!ok) return res.status(409).json({ error: "Invalid pick" });
    return res.json(draftStore.getState());
  });

  // POST /draft/stage — update staged (pending) characters; body: { codenames: string[], action: 'ban'|'pick' }
  router.post("/stage", (req, res) => {
    const { codenames, action } = req.body ?? {};
    if (!Array.isArray(codenames) || (action !== "ban" && action !== "pick")) {
      return res.status(400).json({ error: "codenames (array) and action ('ban'|'pick') are required" });
    }
    draftStore.setStaging(codenames, action as "ban" | "pick");
    return res.json({ ok: true });
  });

  // POST /draft/lock-in — atomically lock in a turn's worth of bans/picks; body: { codenames: string[] }
  router.post("/lock-in", (req, res) => {
    const { codenames } = req.body ?? {};
    if (!Array.isArray(codenames) || codenames.length === 0) {
      return res.status(400).json({ error: "codenames (non-empty array) is required" });
    }
    const ok = draftStore.lockIn(codenames);
    if (!ok) return res.status(409).json({ error: "Invalid lock-in" });
    return res.json(draftStore.getState());
  });

  // POST /draft/undo
  router.post("/undo", (_req, res) => {
    const ok = draftStore.undo();
    if (!ok) return res.status(409).json({ error: "Nothing to undo" });
    return res.json(draftStore.getState());
  });

  // POST /draft/redo
  router.post("/redo", (_req, res) => {
    const ok = draftStore.redo();
    if (!ok) return res.status(409).json({ error: "Nothing to redo" });
    return res.json(draftStore.getState());
  });

  // POST /draft/restart — reset to team name entry
  router.post("/restart", (_req, res) => {
    draftStore.restart();
    return res.json(draftStore.getState());
  });

  return router;
}
