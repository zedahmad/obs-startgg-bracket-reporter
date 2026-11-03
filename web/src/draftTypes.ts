export interface DraftCharacter {
  codename: string;
  displayName: string;
  imagePath: string;
  portraitOffset?: number;
}

export interface DraftRuleset {
  name: string;
  teamSize: number;
  banOrder: number[];
  pickOrder: number[];
  characters: DraftCharacter[];
}

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
  staging: DraftStagingState | null;
}
