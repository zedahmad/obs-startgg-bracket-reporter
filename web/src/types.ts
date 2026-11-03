export type Match = {
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

  isScoreboardMatch: boolean;
  startggStreamId: string | null;
  status: "idle" | "live" | "saved" | "complete";
};

export type TournamentStream = {
  id: string;
  name: string;
  source: string | null;
  externalStreamId?: string | null;
};
