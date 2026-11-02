export type OfflineDetails = {
  player1: { name: string };
  player2: { name: string };
  round: string;
};

export function reconcileOfflineInput(
  draft: string,
  previous: string | undefined,
  next: string,
) {
  return previous === undefined || draft === previous ? next : draft;
}
