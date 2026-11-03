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
  draftStore.start(ruleset, "set-1", "Team A", "Team B");
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

test("draft defeat toggles are limited to completed drafted characters", () => {
  draftStore.restart();
  draftStore.start(ruleset, "set-1", "Team A", "Team B");
  assert.equal(draftStore.getState().matchId, "set-1");
  assert.equal(draftStore.toggleDefeated(0, "C"), null);

  draftStore.setRpsWinner(1);
  assert.equal(draftStore.lockIn(["A"]), true);
  assert.equal(draftStore.lockIn(["B"]), true);
  assert.equal(draftStore.lockIn(["C"]), true);
  assert.equal(draftStore.lockIn(["D"]), true);
  assert.equal(draftStore.getState().phase, "complete");

  assert.equal(draftStore.toggleDefeated(0, "C"), true);
  assert.deepEqual(draftStore.getState().teamADefeated, ["C"]);
  assert.equal(draftStore.getState().canUndo, false);
  assert.equal(draftStore.undo(), false);
  assert.equal(draftStore.toggleDefeated(0, "C"), false);
  assert.deepEqual(draftStore.getState().teamADefeated, []);
  assert.equal(draftStore.toggleDefeated(0, "D"), null);

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
    isScoreboardMatch: true,
    startggStreamId: "stream-1",
    status: "live",
    updatedAt: 0,
  };

  const result = reducer(
    { [match.id]: match },
    { type: "MATCH_COMPLETED", matchId: match.id },
  );

  assert.equal(result[match.id].status, "complete");
  assert.equal(result[match.id].isScoreboardMatch, false);
});

test("offline detail updates preserve optional sponsor and country metadata", () => {
  const match: Match = {
    id: "offline-match",
    round: "Offline Match",
    player1: { id: "offline-player-1", name: "Player 1" },
    player2: { id: "offline-player-2", name: "Player 2" },
    score1: 0,
    score2: 0,
    isScoreboardMatch: true,
    startggStreamId: null,
    status: "live",
    updatedAt: 0,
  };

  const result = reducer(
    { [match.id]: match },
    {
      type: "OFFLINE_MATCH_DETAILS_UPDATED",
      matchId: match.id,
      player1Name: "Updated 1",
      player1Sponsor: "TEAM",
      player1Country: "US",
      player2Name: "Updated 2",
      player2Sponsor: null,
      player2Country: "JP",
      matchLabel: "Grand Final",
    },
  );

  assert.deepEqual(result[match.id].player1, {
    id: "offline-player-1",
    name: "Updated 1",
    sponsor: "TEAM",
    country: "US",
  });
  assert.deepEqual(result[match.id].player2, {
    id: "offline-player-2",
    name: "Updated 2",
    sponsor: null,
    country: "JP",
  });
  assert.equal(result[match.id].round, "Grand Final");
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
    text: { playerNameSize: 32, playerNameColor: "#abcdef" },
  });

  assert.equal(settings.canvas.width, 1280);
  assert.equal(settings.canvas.height, 1080);
  assert.equal(settings.text.playerNameSize, 32);
  assert.equal(settings.text.sponsorTagSize, 24);
  assert.equal(settings.text.sponsorTagColor, "#b8c7e0");
  assert.equal(settings.text.sponsorTagsEnabled, true);
  assert.equal(settings.text.sponsorTagSeparatorEnabled, false);
  assert.equal(settings.text.playerFlagsEnabled, false);
  assert.equal(settings.layout.mirrorPlayerCards, true);
  assert.equal(settings.elements.player1.scoreWidth, 60);
  assert.deepEqual(
    settings.elements.player1Characters,
    DEFAULT_SCOREBOARD_SETTINGS.elements.player1Characters,
  );
  assert.deepEqual(
    settings.elements.player1,
    DEFAULT_SCOREBOARD_SETTINGS.elements.player1,
  );
});

test("scoreboard defaults use the updated player sizing", () => {
  assert.equal(DEFAULT_SCOREBOARD_SETTINGS.text.playerNameSize, 30);
  assert.equal(DEFAULT_SCOREBOARD_SETTINGS.elements.player1.scoreWidth, 60);
  assert.equal(DEFAULT_SCOREBOARD_SETTINGS.elements.player2.scoreWidth, 60);
});

test("scoreboard symmetry mirrors player 1 geometry and preserves player 2 styling", () => {
  const settings = structuredClone(DEFAULT_SCOREBOARD_SETTINGS);
  settings.canvas.width = 1600;
  settings.elements.player1 = {
    ...settings.elements.player1,
    enabled: false,
    x: 125,
    y: 240,
    width: 420,
    height: 72,
    scoreWidth: 64,
  };
  settings.elements.player2.x = 40;
  settings.elements.player2.nameBackground.startColor = "#123456";
  settings.elements.player1Characters = {
    enabled: false,
    x: 150,
    y: 330,
    width: 240,
    height: 54,
  };

  const parsed = parseScoreboardSettings(settings);

  assert.equal(parsed.elements.player2.enabled, false);
  assert.equal(parsed.elements.player2.x, 1055);
  assert.equal(parsed.elements.player2.y, 240);
  assert.equal(parsed.elements.player2.width, 420);
  assert.equal(parsed.elements.player2.height, 72);
  assert.equal(parsed.elements.player2.scoreWidth, 64);
  assert.equal(
    parsed.elements.player2.nameBackground.startColor,
    "#123456",
  );
  assert.deepEqual(parsed.elements.player2Characters, {
    enabled: false,
    x: 1210,
    y: 330,
    width: 240,
    height: 54,
  });
});

test("disabled scoreboard symmetry preserves independent player 2 geometry", () => {
  const settings = structuredClone(DEFAULT_SCOREBOARD_SETTINGS);
  settings.layout.mirrorPlayerCards = false;
  settings.elements.player2.x = 77;
  settings.elements.player2.y = 88;

  const parsed = parseScoreboardSettings(settings);

  assert.equal(parsed.elements.player2.x, 77);
  assert.equal(parsed.elements.player2.y, 88);
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
  assert.equal(
    second.elements.player2.x,
    second.canvas.width - 400 - second.elements.player1.width,
  );
  assert.equal(second.elements.player2.y, 200);
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
    isScoreboardMatch: true,
    startggStreamId: "stream-1",
    status: "live",
    updatedAt: 0,
  };
  const secondMatch: Match = {
    ...firstMatch,
    id: "set-2",
    isScoreboardMatch: false,
    startggStreamId: null,
    status: "idle",
  };

  const result = reducer(
    { [firstMatch.id]: firstMatch, [secondMatch.id]: secondMatch },
    { type: "SCOREBOARD_MATCH_SELECTED", matchId: secondMatch.id },
  );

  assert.equal(result[firstMatch.id].isScoreboardMatch, false);
  assert.equal(result[firstMatch.id].status, "live");
  assert.equal(result[secondMatch.id].isScoreboardMatch, true);
  assert.equal(result[secondMatch.id].status, "idle");
});

test("off-stream matches can start without becoming the scoreboard match", () => {
  const match: Match = {
    id: "set-1",
    round: "Round 1",
    player1: { id: "1", name: "Player 1" },
    player2: { id: "2", name: "Player 2" },
    score1: 0,
    score2: 0,
    isScoreboardMatch: false,
    startggStreamId: null,
    status: "idle",
    updatedAt: 0,
  };

  const result = reducer(
    { [match.id]: match },
    { type: "MATCH_STARTED", matchId: match.id },
  );

  assert.equal(result[match.id].status, "live");
  assert.equal(result[match.id].isScoreboardMatch, false);
});

test("start.gg stream metadata does not select a scoreboard match", () => {
  const match = mapSetToMatch({
    id: "set-1",
    fullRoundText: "Winners Round 1",
    state: 1,
    stream: { id: "stream-1" },
    slots: [
      {
        entrant: {
          id: "1",
          name: "TEAM | Player 1",
          participants: [{
            gamerTag: "Player 1",
            prefix: "TEAM",
            user: { location: { country: "United States" } },
          }],
        },
      },
      {
        entrant: {
          id: "2",
          name: "Player 2",
          participants: [{
            gamerTag: "Player 2",
            prefix: " ",
            user: { location: { country: "United States" } },
          }],
        },
      },
    ],
  });

  assert.ok(match);
  assert.equal(match.isScoreboardMatch, false);
  assert.equal(match.startggStreamId, "stream-1");
  assert.equal(match.status, "idle");
  assert.equal(match.player1.name, "Player 1");
  assert.equal(match.player1.sponsor, "TEAM");
  assert.equal(match.player1.country, "United States");
  assert.equal(match.player2.sponsor, null);
  assert.equal(match.player2.country, "United States");
});

test("start.gg refresh preserves the local scoreboard selection", () => {
  const localMatch: Match = {
    id: "set-1",
    round: "Round 1",
    player1: { id: "1", name: "Player 1" },
    player2: { id: "2", name: "Player 2" },
    score1: 1,
    score2: 0,
    isScoreboardMatch: true,
    startggStreamId: null,
    status: "live",
    updatedAt: 10,
  };
  const refreshedMatch: Match = {
    ...localMatch,
    score1: 0,
    isScoreboardMatch: false,
    startggStreamId: "startgg-stream",
    status: "idle",
    updatedAt: 20,
  };

  store.setInitialState([localMatch]);
  store.mergeFromStartGG([refreshedMatch]);

  const result = store.getState()[localMatch.id];
  assert.equal(result.isScoreboardMatch, true);
  assert.equal(result.startggStreamId, "startgg-stream");
  assert.equal(result.status, "live");
  assert.equal(result.score1, 1);

  store.setInitialState([]);
});
