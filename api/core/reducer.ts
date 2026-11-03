import { Match } from "./types";
import { Event } from "./events";

export function reducer(state: Record<string, Match>, event: Event) {
  if (event.type === "OFFLINE_MATCH_CONFIGURED") {
    return {
      [event.match.id]: event.match,
    };
  }

  const match = state[event.matchId];
  if (!match) return state;

  switch (event.type) {
    case "OFFLINE_MATCH_DETAILS_UPDATED":
      match.player1.name = event.player1Name;
      match.player1.sponsor = event.player1Sponsor;
      match.player1.country = event.player1Country;
      match.player2.name = event.player2Name;
      match.player2.sponsor = event.player2Sponsor;
      match.player2.country = event.player2Country;
      match.round = event.matchLabel;
      break;

    case "SCOREBOARD_MATCH_SELECTED":
      if (match.status === "complete") return state;
      for (const otherMatch of Object.values(state)) {
        if (otherMatch.id !== match.id && otherMatch.isScoreboardMatch) {
          otherMatch.isScoreboardMatch = false;
          otherMatch.updatedAt = Date.now();
        }
      }
      match.isScoreboardMatch = true;
      break;

    case "SCOREBOARD_MATCH_CLEARED":
      if (!match.isScoreboardMatch) return state;
      match.isScoreboardMatch = false;
      break;

    case "STARTGG_STREAM_UPDATED":
      match.startggStreamId = event.streamId;
      break;

    case "MATCH_STARTED":
      if (match.status !== "idle") return state;
      match.status = "live";
      break;

    case "SCORE_UPDATED":
      if (match.status === "complete") return state;
      match.score1 = event.score1;
      match.score2 = event.score2;
      match.updatedAt = Date.now();
      break;

    case "MATCH_RESULT_SAVED":
      if (match.status !== "live") return state;
      match.status = "saved";
      break;

    case "MATCH_COMPLETED":
      if (match.status !== "live" && match.status !== "saved") return state;
      match.status = "complete";
      match.isScoreboardMatch = false;
      break;
  }

  match.updatedAt = Date.now();
  return state;
}
