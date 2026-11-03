export type OfflineDetails = {
  player1: {
    name: string;
    sponsor?: string | null;
    country?: string | null;
  };
  player2: {
    name: string;
    sponsor?: string | null;
    country?: string | null;
  };
  round: string;
};

export function reconcileOfflineInput(
  draft: string,
  previous: string | undefined,
  next: string,
) {
  return previous === undefined || draft === previous ? next : draft;
}
