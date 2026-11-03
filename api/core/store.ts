import { reducer } from "./reducer";
import { Event } from "./events";
import { Match } from "./types";

type Listener = (state: Record<string, Match>, event: Event) => void;

class Store {
  private state: Record<string, Match> = {};
  private listeners: Listener[] = [];

  dispatch(event: Event) {
    this.state = reducer(this.state, event);
    this.listeners.forEach((l) => l(this.state, event));
  }

  getState() {
    return this.state;
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
  }

  setInitialState(matches: Match[]) {
    this.state = Object.fromEntries(matches.map((m) => [m.id, m]));
  }

  mergeFromStartGG(freshMatches: Match[]) {
    const nextState: Record<string, Match> = {};

    for (const fresh of freshMatches) {
      const existing = this.state[fresh.id];
      if (existing) {
        // Preserve locally-managed state; only update structural metadata from start.gg
        nextState[fresh.id] = {
          ...fresh,
          score1: existing.score1,
          score2: existing.score2,
          status: existing.status,
          isScoreboardMatch: existing.isScoreboardMatch,
          updatedAt: existing.updatedAt,
        };
      } else {
        nextState[fresh.id] = fresh;
      }
    }

    this.state = nextState;
  }
}

export const store = new Store();
