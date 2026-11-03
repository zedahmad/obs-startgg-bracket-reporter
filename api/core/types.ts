export type MatchStatus =
  | "idle"
  | "live"
  | "saved"
  | "complete";

export interface Match {
  id: string;
  round: string;

  player1: {
    id: string;
    name: string;
    sponsor?: string | null;
    country?: string | null;
  };
  player2: {
    id: string;
    name: string;
    sponsor?: string | null;
    country?: string | null;
  };

  score1: number;
  score2: number;

  /** Whether this is the one match currently shown on the local scoreboard. */
  isScoreboardMatch: boolean;
  /** Stream assignment currently reported by start.gg. */
  startggStreamId: string | null;
  status: MatchStatus;

  updatedAt: number;
}

export function isMatchNotNull(m: Match | null): m is Match {
  return m !== null;
}

export interface TournamentStream {
  id: string; // start.gg stream object ID
  name: string;
  source: string | null;
  externalStreamId?: string | null; // Twitch/YouTube/etc platform stream id if present
}
