import { Router } from "express";
import type { Response } from "express";
import { store } from "../core/store";
import { Server } from "socket.io";
import type { Match } from "../core/types";

export function adjustDisplayedScore(
  match: Pick<Match, "score1" | "score2">,
  player: 1 | 2,
  delta: -1 | 1,
  swapped: boolean,
) {
  const updatesScore1 = (player === 1) !== swapped;

  return {
    score1: updatesScore1
      ? Math.max(0, match.score1 + delta)
      : match.score1,
    score2: updatesScore1
      ? match.score2
      : Math.max(0, match.score2 + delta),
  };
}

export function createStreamDeckRouter(io: Server) {
  const router = Router();

  const displayState = {
    visible: true,
    swapped: false,
  };

  function emitDisplay() {
    io.emit("scoreboard:display", displayState);
  }

  function findActiveMatch() {
    return (
      Object.values(store.getState()).find(
        (match) => match.isScoreboardMatch && match.status !== "complete",
      ) ??
      null
    );
  }

  function updateDisplayedScore(
    res: Response,
    player: 1 | 2,
    delta: -1 | 1,
  ) {
    const match = findActiveMatch();
    if (!match) return res.status(404).json({ error: "No active match found" });
    if (match.status === "complete") {
      return res.status(409).json({ error: "Match is complete" });
    }

    const scores = adjustDisplayedScore(
      match,
      player,
      delta,
      displayState.swapped,
    );

    store.dispatch({
      type: "SCORE_UPDATED",
      matchId: match.id,
      ...scores,
    });
    return res.json(store.getState()[match.id]);
  }

  // ── Score controls ────────────────────────────────────────────────────────

  router.all("/p1/score/up", (req, res) => {
    return updateDisplayedScore(res, 1, 1);
  });

  router.all("/p1/score/down", (req, res) => {
    return updateDisplayedScore(res, 1, -1);
  });

  router.all("/p2/score/up", (req, res) => {
    return updateDisplayedScore(res, 2, 1);
  });

  router.all("/p2/score/down", (req, res) => {
    return updateDisplayedScore(res, 2, -1);
  });

  router.all("/score/reset", (req, res) => {
    const match = findActiveMatch();
    if (!match) return res.status(404).json({ error: "No active match found" });
    if (match.status === "complete") return res.status(409).json({ error: "Match is complete" });

    store.dispatch({
      type: "SCORE_UPDATED",
      matchId: match.id,
      score1: 0,
      score2: 0,
    });
    return res.json(store.getState()[match.id]);
  });

  // ── Display controls ──────────────────────────────────────────────────────

  router.all("/swap", (req, res) => {
    displayState.swapped = !displayState.swapped;
    emitDisplay();
    return res.json({ swapped: displayState.swapped });
  });

  router.all("/scoreboard/show", (req, res) => {
    displayState.visible = true;
    emitDisplay();
    return res.json({ visible: true });
  });

  router.all("/scoreboard/hide", (req, res) => {
    displayState.visible = false;
    emitDisplay();
    return res.json({ visible: false });
  });

  router.all("/display", (_req, res) => {
    return res.json(displayState);
  });

  return {
    router,
    getDisplayState: () => displayState,
  };
}
