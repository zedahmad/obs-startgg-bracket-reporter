import { DraftState, DraftRuleset } from "./draftTypes";

type Snapshot = Omit<DraftState, "canUndo" | "canRedo">;

const MAX_HISTORY = 50;

class DraftStore {
  private state: DraftState;
  private history: Snapshot[] = [];
  private historyIndex = -1;
  private listeners: Array<(state: DraftState) => void> = [];

  constructor() {
    this.state = this.initialState();
  }

  private initialState(): DraftState {
    return {
      matchId: null,
      phase: "idle",
      pendingTeam1Name: "",
      pendingTeam2Name: "",
      teamAName: "",
      teamBName: "",
      teamABans: [],
      teamBBans: [],
      teamAPicks: [],
      teamBPicks: [],
      teamADefeated: [],
      teamBDefeated: [],
      currentStep: 0,
      currentTeam: null,
      rpsWinner: null,
      ruleset: null,
      canUndo: false,
      canRedo: false,
      staging: null,
    };
  }

  private saveSnapshot() {
    const { canUndo: _u, canRedo: _r, ...snap } = this.state;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap as Snapshot);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(this.history.length - MAX_HISTORY);
    }
    this.historyIndex = this.history.length - 1;
  }

  private recomputeUndoRedo() {
    this.state.canUndo = this.historyIndex > 0;
    this.state.canRedo = this.historyIndex < this.history.length - 1;
  }

  private emit() {
    this.recomputeUndoRedo();
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: (state: DraftState) => void) {
    this.listeners.push(listener);
  }

  getState(): DraftState {
    return { ...this.state };
  }

  setStaging(codenames: string[], action: "ban" | "pick") {
    if (this.state.phase !== action) return;
    this.state = {
      ...this.state,
      staging: codenames.length > 0 ? { codenames, action } : null,
    };
    this.emit();
  }

  start(
    ruleset: DraftRuleset,
    matchId: string,
    team1Name: string,
    team2Name: string,
  ) {
    this.state = {
      ...this.initialState(),
      matchId,
      phase: "rps",
      ruleset,
      pendingTeam1Name: team1Name || "Team 1",
      pendingTeam2Name: team2Name || "Team 2",
    };
    this.history = [];
    this.historyIndex = -1;
    this.saveSnapshot();
    this.emit();
  }

  toggleDefeated(team: 0 | 1, codename: string): boolean | null {
    if (this.state.phase !== "complete") return null;

    const picks = team === 0
      ? this.state.teamAPicks
      : this.state.teamBPicks;
    if (!picks.includes(codename)) return null;

    const defeated = team === 0
      ? this.state.teamADefeated
      : this.state.teamBDefeated;
    const isDefeated = defeated.includes(codename);
    const nextDefeated = isDefeated
      ? defeated.filter((value) => value !== codename)
      : [...defeated, codename];

    this.state = {
      ...this.state,
      ...(team === 0
        ? { teamADefeated: nextDefeated }
        : { teamBDefeated: nextDefeated }),
    };
    const { canUndo: _u, canRedo: _r, ...snapshot } = this.state;
    this.history = [snapshot];
    this.historyIndex = 0;
    this.emit();
    return !isDefeated;
  }

  setRpsWinner(winner: 1 | 2) {
    if (this.state.phase !== "rps") return;
    if (!this.state.ruleset) return;

    const ruleset = winner === 1
      ? this.state.ruleset
      : {
          ...this.state.ruleset,
          banOrder: this.state.ruleset.banOrder.map((team) => 1 - team),
          pickOrder: this.state.ruleset.pickOrder.map((team) => 1 - team),
        };

    this.state = {
      ...this.state,
      phase: "ban",
      teamAName: this.state.pendingTeam1Name,
      teamBName: this.state.pendingTeam2Name,
      rpsWinner: winner,
      ruleset,
      currentStep: 0,
      currentTeam: ruleset.banOrder[0] as 0 | 1,
    };
    this.saveSnapshot();
    this.emit();
  }

  ban(codename: string): boolean {
    if (this.state.phase !== "ban") return false;
    if (!this.state.ruleset) return false;

    const allBanned = [...this.state.teamABans, ...this.state.teamBBans];
    const allPicked = [...this.state.teamAPicks, ...this.state.teamBPicks];
    if (allBanned.includes(codename) || allPicked.includes(codename)) return false;

    const { banOrder } = this.state.ruleset;
    const actingTeam = banOrder[this.state.currentStep];

    const newTeamABans = actingTeam === 0 ? [...this.state.teamABans, codename] : [...this.state.teamABans];
    const newTeamBBans = actingTeam === 1 ? [...this.state.teamBBans, codename] : [...this.state.teamBBans];

    const nextStep = this.state.currentStep + 1;

    if (nextStep >= banOrder.length) {
      // Transition to pick phase
      const { pickOrder } = this.state.ruleset;
      this.state = {
        ...this.state,
        teamABans: newTeamABans,
        teamBBans: newTeamBBans,
        phase: "pick",
        currentStep: 0,
        currentTeam: pickOrder[0] as 0 | 1,
        staging: null,
      };
    } else {
      this.state = {
        ...this.state,
        teamABans: newTeamABans,
        teamBBans: newTeamBBans,
        currentStep: nextStep,
        currentTeam: banOrder[nextStep] as 0 | 1,
        staging: null,
      };
    }

    this.saveSnapshot();
    this.emit();
    return true;
  }

  pick(codename: string): boolean {
    if (this.state.phase !== "pick") return false;
    if (!this.state.ruleset) return false;

    const allBanned = [...this.state.teamABans, ...this.state.teamBBans];
    const allPicked = [...this.state.teamAPicks, ...this.state.teamBPicks];
    if (allBanned.includes(codename) || allPicked.includes(codename)) return false;

    const { pickOrder } = this.state.ruleset;
    const actingTeam = pickOrder[this.state.currentStep];

    const newTeamAPicks = actingTeam === 0 ? [...this.state.teamAPicks, codename] : [...this.state.teamAPicks];
    const newTeamBPicks = actingTeam === 1 ? [...this.state.teamBPicks, codename] : [...this.state.teamBPicks];

    const nextStep = this.state.currentStep + 1;

    if (nextStep >= pickOrder.length) {
      this.state = {
        ...this.state,
        teamAPicks: newTeamAPicks,
        teamBPicks: newTeamBPicks,
        phase: "complete",
        currentStep: nextStep,
        currentTeam: null,
        staging: null,
      };
    } else {
      this.state = {
        ...this.state,
        teamAPicks: newTeamAPicks,
        teamBPicks: newTeamBPicks,
        currentStep: nextStep,
        currentTeam: pickOrder[nextStep] as 0 | 1,
        staging: null,
      };
    }

    this.saveSnapshot();
    this.emit();
    return true;
  }

  /**
   * Atomically lock in multiple bans or picks in a single state update.
   * This ensures all chars transition from pending→confirmed in one socket emit,
   * preventing animation interruptions between sequential chars in a multi-char turn.
   */
  lockIn(codenames: string[]): boolean {
    if (this.state.phase !== "ban" && this.state.phase !== "pick") return false;
    if (!this.state.ruleset) return false;

    // Validate all codenames up-front before mutating anything
    const allBanned = [...this.state.teamABans, ...this.state.teamBBans];
    const allPicked = [...this.state.teamAPicks, ...this.state.teamBPicks];
    for (const codename of codenames) {
      if (allBanned.includes(codename) || allPicked.includes(codename)) return false;
    }

    // Apply all bans/picks atomically — phase may transition mid-batch (e.g. last ban)
    let s: Omit<DraftState, "canUndo" | "canRedo"> = { ...this.state, staging: null };
    const ruleset = this.state.ruleset!;

    for (const codename of codenames) {
      if (s.phase === "ban") {
        const actingTeam = ruleset.banOrder[s.currentStep];
        const nextStep   = s.currentStep + 1;
        const newABans   = actingTeam === 0 ? [...s.teamABans, codename] : s.teamABans;
        const newBBans   = actingTeam === 1 ? [...s.teamBBans, codename] : s.teamBBans;
        if (nextStep >= ruleset.banOrder.length) {
          s = { ...s, teamABans: newABans, teamBBans: newBBans, phase: "pick", currentStep: 0, currentTeam: ruleset.pickOrder[0] as 0 | 1 };
        } else {
          s = { ...s, teamABans: newABans, teamBBans: newBBans, currentStep: nextStep, currentTeam: ruleset.banOrder[nextStep] as 0 | 1 };
        }
      } else if (s.phase === "pick") {
        const actingTeam = ruleset.pickOrder[s.currentStep];
        const nextStep   = s.currentStep + 1;
        const newAPicks  = actingTeam === 0 ? [...s.teamAPicks, codename] : s.teamAPicks;
        const newBPicks  = actingTeam === 1 ? [...s.teamBPicks, codename] : s.teamBPicks;
        if (nextStep >= ruleset.pickOrder.length) {
          s = { ...s, teamAPicks: newAPicks, teamBPicks: newBPicks, phase: "complete", currentStep: nextStep, currentTeam: null };
        } else {
          s = { ...s, teamAPicks: newAPicks, teamBPicks: newBPicks, currentStep: nextStep, currentTeam: ruleset.pickOrder[nextStep] as 0 | 1 };
        }
      }
    }

    this.state = { ...s, canUndo: false, canRedo: false };
    this.saveSnapshot();
    this.emit();
    return true;
  }

  undo(): boolean {
    if (this.historyIndex <= 0) return false;
    this.historyIndex--;
    const snap = this.history[this.historyIndex];
    this.state = { ...snap, canUndo: false, canRedo: false };
    this.emit();
    return true;
  }

  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) return false;
    this.historyIndex++;
    const snap = this.history[this.historyIndex];
    this.state = { ...snap, canUndo: false, canRedo: false };
    this.emit();
    return true;
  }

  restart() {
    this.state = this.initialState();
    this.history = [];
    this.historyIndex = -1;
    this.emit();
  }
}

export const draftStore = new DraftStore();
