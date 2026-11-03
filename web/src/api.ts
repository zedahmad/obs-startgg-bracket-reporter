import axios from "axios";
import type { DraftState } from "./draftTypes";
import type { SettingsChanges } from "./settingsChanges";
import type { Match } from "./types";

export const selectScoreboardMatch = async (
  matchId: string,
  streamId?: string,
) => {
  const res = await axios.post(`/assign`, {
    matchId,
    streamId,
  });

  return res.data;
};

export const clearScoreboardMatch = async (matchId: string) => {
  const res = await axios.post(`/unassign`, {
    matchId,
  });

  return res.data;
};

export const startMatch = async (matchId: string) => {
  const res = await axios.post(`/start`, {
    matchId,
  });

  return res.data;
};

export const updateScore = async (
  matchId: string,
  score1: number,
  score2: number,
) => {
  const res = await axios.post(`/updateScoreLocal`, {
    matchId,
    score1,
    score2,
  });

  return res.data;
};

export const updateScoreDelta = async (
  matchId: string,
  player: 1 | 2,
  delta: -1 | 1,
) => {
  const res = await axios.post(`/updateScoreDelta`, {
    matchId,
    player,
    delta,
  });

  return res.data;
};

export const resetScore = async (matchId: string) => {
  const res = await axios.post(`/resetScore`, {
    matchId,
  });

  return res.data;
};

export const createOfflineMatch = async (
  player1Name: string,
  player1Sponsor: string,
  player1Country: string,
  player2Name: string,
  player2Sponsor: string,
  player2Country: string,
  matchLabel: string,
) => {
  const res = await axios.post(`/offline`, {
    player1Name,
    player1Sponsor,
    player1Country,
    player2Name,
    player2Sponsor,
    player2Country,
    matchLabel,
  });

  return res.data;
};

export const updateOfflineMatch = async (
  player1Name: string,
  player1Sponsor: string,
  player1Country: string,
  player2Name: string,
  player2Sponsor: string,
  player2Country: string,
  matchLabel: string,
) => {
  const res = await axios.post(`/offline/update`, {
    player1Name,
    player1Sponsor,
    player1Country,
    player2Name,
    player2Sponsor,
    player2Country,
    matchLabel,
  });

  return res.data;
};

export const getMatches = async () => {
  const res = await axios.get(`/matches`);
  return res.data;
};

export const getStreams = async () => {
  const res = await axios.get(`/streams`);
  return res.data;
};

export const saveResult = async (matchId: string) => {
  const res = await axios.post(`/saveResult`, {
    matchId,
  });

  return res.data;
};

export const submitFinalResult = async (matchId: string) => {
  const res = await axios.post(`/submitFinal`, {
    matchId,
  });

  return res.data;
};

export const refreshStartGG = async () => {
  const res = await axios.post(`/refresh`);
  return res.data;
};

export const getConfig = async () => {
  const res = await axios.get(`/config`);
  return res.data;
};

export const getAppState = async () => {
  const res = await axios.get(`/app-state`);
  return res.data;
};

export const saveConfig = async (
  STARTGG_API_TOKEN: string | undefined,
  TOURNAMENT_SLUG: string,
) => {
  const res = await axios.post(`/config`, {
    STARTGG_API_TOKEN,
    TOURNAMENT_SLUG,
  });

  return res.data;
};

export const saveScoreboardSettings = async (
  scoreboardPatch: SettingsChanges,
) => {
  const res = await axios.post(`/settings/scoreboard`, { scoreboardPatch });

  return res.data;
};

export const saveStartggApiToken = async (startggApiToken: string) => {
  const res = await axios.post(`/settings/startgg-token`, {
    startggApiToken,
  });

  return res.data;
};

export const swapScoreboardPlayers = async () => {
  const res = await axios.post(`/streamdeck/swap`);
  return res.data;
};

export const showScoreboard = async () => {
  const res = await axios.post(`/streamdeck/scoreboard/show`);
  return res.data;
};

export const hideScoreboard = async () => {
  const res = await axios.post(`/streamdeck/scoreboard/hide`);
  return res.data;
};

export const startCharacterDraft = async (
  matchId: string,
  streamId?: string,
): Promise<{ draft: DraftState; match: Match }> => {
  const res = await axios.post(`/api/draft/start`, {
    matchId,
    streamId,
  });
  return res.data;
};

export const toggleDraftDefeat = async (
  team: 0 | 1,
  codename: string,
): Promise<{ draft: DraftState; match: Match }> => {
  const res = await axios.post(`/api/draft/defeat`, {
    team,
    codename,
  });
  return res.data;
};
