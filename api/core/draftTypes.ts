export interface DraftCharacter {
  codename: string;
  displayName: string;
  imagePath: string;
  /** Optional horizontal offset as % of portrait height. Positive = more gap from
   *  previously drafted character; negative = less gap / more overlap. Defaults to 0. */
  portraitOffset?: number;
}

export interface DraftRuleset {
  name: string;
  teamSize: number;
  banOrder: number[]; // 0=teamA, 1=teamB for each ban step
  pickOrder: number[]; // 0=teamA, 1=teamB for each pick step
  characters: DraftCharacter[];
}

/** Characters staged (selected but not yet locked in) by the acting team. */
export interface DraftStagingState {
  codenames: string[];
  action: "ban" | "pick";
}

export interface DraftState {
  matchId: string | null;
  phase: "idle" | "rps" | "ban" | "pick" | "complete";
  pendingTeam1Name: string;
  pendingTeam2Name: string;
  teamAName: string;
  teamBName: string;
  teamABans: string[];
  teamBBans: string[];
  teamAPicks: string[];
  teamBPicks: string[];
  teamADefeated: string[];
  teamBDefeated: string[];
  currentStep: number;
  currentTeam: 0 | 1 | null;
  rpsWinner: 1 | 2 | null;
  ruleset: DraftRuleset | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Characters selected but not yet confirmed. Shown at 30% opacity on overlay. */
  staging: DraftStagingState | null;
}
