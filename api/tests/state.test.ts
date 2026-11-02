import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { draftStore } from "../core/draftStore";
import type { DraftRuleset } from "../core/draftTypes";
import { reducer } from "../core/reducer";
import type { Match } from "../core/types";
import { store } from "../core/store";
import { adjustDisplayedScore } from "../routes/streamdeck";
import { mapSetToMatch } from "../services/mapToMatch";
import {
  DEFAULT_SCOREBOARD_SETTINGS,
  mergeScoreboardSettings,
  parseScoreboardSettings,
  patchScoreboardSettings,
} from "../core/scoreboardSettings";
import { listenOnAvailablePort } from "../services/listenOnAvailablePort";

const ruleset: DraftRuleset = {
  name: "Test",
  teamSize: 1,
  banOrder: [0, 1],
  pickOrder: [0, 1],
  characters: [
    { codename: "A", displayName: "A", imagePath: "/a.png" },
    { codename: "B", displayName: "B", imagePath: "/b.png" },
    { codename: "C", displayName: "C", imagePath: "/c.png" },
    { codename: "D", displayName: "D", imagePath: "/d.png" },
  ],
};

test("draft undo and redo restore the adjacent state", () => {
  draftStore.restart();
  draftStore.start(ruleset, "Team A", "Team B");
  draftStore.setRpsWinner(1);
  assert.equal(draftStore.lockIn(["A"]), true);

  assert.deepEqual(draftStore.getState().teamABans, ["A"]);
  assert.equal(draftStore.getState().phase, "ban");
  assert.equal(draftStore.getState().currentStep, 1);

  assert.equal(draftStore.undo(), true);
  assert.deepEqual(draftStore.getState().teamABans, []);
  assert.equal(draftStore.getState().phase, "ban");
  assert.equal(draftStore.getState().currentStep, 0);

  assert.equal(draftStore.redo(), true);
  assert.deepEqual(draftStore.getState().teamABans, ["A"]);
  assert.equal(draftStore.getState().currentStep, 1);

  draftStore.restart();
});

test("successful final submission can complete a live match", () => {
  const match: Match = {
    id: "set-1",
    round: "Winners Final",
    player1: { id: "1", name: "Player 1" },
    player2: { id: "2", name: "Player 2" },
    score1: 3,
    score2: 1,
    streamId: "stream-1",
    startggStreamId: "stream-1",
    status: "live",
    updatedAt: 0,
  };

  const result = reducer(
    { [match.id]: match },
    { type: "MATCH_COMPLETED", matchId: match.id },
  );

  assert.equal(result[match.id].status, "complete");
  assert.equal(result[match.id].streamId, null);
});

test("display-side score controls follow swapped players", () => {
  const scores = { score1: 2, score2: 1 };

  assert.deepEqual(adjustDisplayedScore(scores, 1, 1, false), {
    score1: 3,
    score2: 1,
  });
  assert.deepEqual(adjustDisplayedScore(scores, 1, 1, true), {
    score1: 2,
    score2: 2,
  });
  assert.deepEqual(adjustDisplayedScore(scores, 2, -1, true), {
    score1: 1,
    score2: 1,
  });
  assert.deepEqual(adjustDisplayedScore({ score1: 0, score2: 0 }, 2, -1, false), {
    score1: 0,
    score2: 0,
  });
});

test("scoreboard settings merge persisted partial settings with defaults", () => {
  const settings = mergeScoreboardSettings({
    canvas: { width: 1280 },
    text: { playerNameSize: 32 },
  });

  assert.equal(settings.canvas.width, 1280);
  assert.equal(settings.canvas.height, 1080);
  assert.equal(settings.text.playerNameSize, 32);
  assert.deepEqual(
    settings.elements.player1,
    DEFAULT_SCOREBOARD_SETTINGS.elements.player1,
  );
});

test("scoreboard settings reject a score box wider than its player block", () => {
  const settings = structuredClone(DEFAULT_SCOREBOARD_SETTINGS);
  settings.elements.player1.scoreWidth = settings.elements.player1.width;

  assert.throws(
    () => parseScoreboardSettings(settings),
    /scoreWidth must be smaller/,
  );
});

test("settings patches preserve unrelated concurrent changes", () => {
  const first = patchScoreboardSettings(DEFAULT_SCOREBOARD_SETTINGS, {
    text: { playerNameSize: 32 },
    elements: { player1: { x: 400 } },
  });
  const second = patchScoreboardSettings(first, {
    text: { scoreSize: 48 },
    elements: { player1: { y: 200 } },
  });

  assert.equal(second.text.playerNameSize, 32);
  assert.equal(second.text.scoreSize, 48);
  assert.equal(second.elements.player1.x, 400);
  assert.equal(second.elements.player1.y, 200);
  assert.equal(second.elements.player2.x, DEFAULT_SCOREBOARD_SETTINGS.elements.player2.x);
});

test("settings patches validate the merged geometry", () => {
  assert.throws(
    () => patchScoreboardSettings(DEFAULT_SCOREBOARD_SETTINGS, {
      elements: { player1: { width: 50 } },
    }),
    /scoreWidth must be smaller/,
  );
  assert.throws(
    () => patchScoreboardSettings(DEFAULT_SCOREBOARD_SETTINGS, null),
    /scoreboardPatch must be an object/,
  );
});

test("development port conflicts fail without falling back", async () => {
  const blocker = http.createServer();
  const candidate = http.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  try {
    const address = blocker.address();
    assert.ok(address && typeof address !== "string");
    await assert.rejects(
      listenOnAvailablePort(candidate, address.port, "127.0.0.1", () => {
        assert.fail("Fallback must not be attempted");
      }, false),
      { code: "EADDRINUSE" },
    );
    assert.equal(candidate.listening, false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("server selects an available port when the preferred port is occupied", async () => {
  const blocker = http.createServer();
  const candidate = http.createServer();

  const close = (server: http.Server) =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

  await new Promise<void>((resolve) => {
    blocker.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = blocker.address();
    assert.ok(address && typeof address !== "string");

    let conflictDetected = false;
    const selectedPort = await listenOnAvailablePort(
      candidate,
      address.port,
      "127.0.0.1",
      () => {
        conflictDetected = true;
      },
    );

    assert.equal(conflictDetected, true);
    assert.notEqual(selectedPort, address.port);
  } finally {
    if (candidate.listening) await close(candidate);
    if (blocker.listening) await close(blocker);
  }
});

test("selecting a scoreboard match replaces the previous local selection", () => {
  const firstMatch: Match = {
    id: "set-1",
    round: "Round 1",
    player1: { id: "1", name: "Player 1" },
    player2: { id: "2", name: "Player 2" },
    score1: 0,
    score2: 0,
    streamId: "stream-1",
    startggStreamId: "stream-1",
    status: "assigned",
    updatedAt: 0,
  };
  const secondMatch: Match = {
    ...firstMatch,
    id: "set-2",
    streamId: null,
    startggStreamId: null,
    status: "idle",
  };

  const result = reducer(
    { [firstMatch.id]: firstMatch, [secondMatch.id]: secondMatch },
    { type: "MATCH_ASSIGNED", matchId: secondMatch.id, streamId: "stream-1" },
  );

  assert.equal(result[firstMatch.id].streamId, null);
  assert.equal(result[firstMatch.id].status, "idle");
  assert.equal(result[secondMatch.id].streamId, "stream-1");
  assert.equal(result[secondMatch.id].status, "assigned");
});

test("start.gg stream metadata does not select a scoreboard match", () => {
  const match = mapSetToMatch({
    id: "set-1",
    fullRoundText: "Winners Round 1",
    state: 1,
    stream: { id: "stream-1" },
    slots: [
      { entrant: { id: "1", name: "Player 1" } },
      { entrant: { id: "2", name: "Player 2" } },
    ],
  });

  assert.ok(match);
  assert.equal(match.streamId, null);
  assert.equal(match.startggStreamId, "stream-1");
  assert.equal(match.status, "idle");
});

test("start.gg refresh preserves the local scoreboard selection", () => {
  const localMatch: Match = {
    id: "set-1",
    round: "Round 1",
    player1: { id: "1", name: "Player 1" },
    player2: { id: "2", name: "Player 2" },
    score1: 1,
    score2: 0,
    streamId: "local-stream",
    startggStreamId: null,
    status: "live",
    updatedAt: 10,
  };
  const refreshedMatch: Match = {
    ...localMatch,
    score1: 0,
    streamId: null,
    startggStreamId: "startgg-stream",
    status: "idle",
    updatedAt: 20,
  };

  store.setInitialState([localMatch]);
  store.mergeFromStartGG([refreshedMatch]);

  const result = store.getState()[localMatch.id];
  assert.equal(result.streamId, "local-stream");
  assert.equal(result.startggStreamId, "startgg-stream");
  assert.equal(result.status, "live");
  assert.equal(result.score1, 1);

  store.setInitialState([]);
});
