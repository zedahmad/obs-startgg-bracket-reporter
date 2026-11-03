import type { Match } from "./types";

export type Event =
  | { type: "OFFLINE_MATCH_CONFIGURED"; matchId: string; match: Match }
  | {
      type: "OFFLINE_MATCH_DETAILS_UPDATED";
      matchId: string;
      player1Name: string;
      player1Sponsor: string | null;
      player1Country: string | null;
      player2Name: string;
      player2Sponsor: string | null;
      player2Country: string | null;
      matchLabel: string;
    }
  | { type: "SCOREBOARD_MATCH_SELECTED"; matchId: string }
  | { type: "SCOREBOARD_MATCH_CLEARED"; matchId: string }
  | { type: "STARTGG_STREAM_UPDATED"; matchId: string; streamId: string }
  | { type: "MATCH_STARTED"; matchId: string }
  | { type: "SCORE_UPDATED"; matchId: string; score1: number; score2: number }
  | { type: "MATCH_RESULT_SAVED"; matchId: string }
  | { type: "MATCH_COMPLETED"; matchId: string };
