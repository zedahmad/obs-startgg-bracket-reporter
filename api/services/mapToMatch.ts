import { Match } from "../core/types";

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function mapEntrant(entrant: any, fallbackId: string) {
  const participants = Array.isArray(entrant?.participants)
    ? entrant.participants
    : [];
  const participant = participants.length === 1 ? participants[0] : null;

  return {
    id: entrant?.id ? String(entrant.id) : fallbackId,
    name:
      normalizeOptionalString(participant?.gamerTag) ??
      normalizeOptionalString(entrant?.name) ??
      "TBD",
    sponsor: normalizeOptionalString(participant?.prefix),
    country: normalizeOptionalString(participant?.user?.location?.country),
  };
}

export function mapSetToMatch(set: any): Match | null {
  const p1 = set.slots?.[0]?.entrant;
  const p2 = set.slots?.[1]?.entrant;
  const startggStreamId = set.stream?.id ? String(set.stream.id) : null;

  if (
    !p1?.id ||
    !p2?.id ||
    p1.name === "BYE" ||
    p2.name === "BYE" ||
    set.state === 3
  )
    return null;

  return {
    id: String(set.id),
    round: set.fullRoundText ?? "Unknown",

    player1: mapEntrant(p1, "p1"),
    player2: mapEntrant(p2, "p2"),

    score1: set.slots?.[0]?.standing?.stats?.score?.value ?? 0,
    score2: set.slots?.[1]?.standing?.stats?.score?.value ?? 0,

    isScoreboardMatch: false,
    startggStreamId,
    status: mapStartGGStateToStatus(set.state),
    updatedAt: Date.now(),
  };
}

function mapStartGGStateToStatus(state: number): Match["status"] {
  if (state === 2) return "live";
  if (state === 3) return "complete";

  return "idle";
}
