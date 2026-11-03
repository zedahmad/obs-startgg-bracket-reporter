import { useEffect, useState, useCallback } from "react";
import type { DraftState, DraftCharacter } from "./draftTypes";
import { io } from "socket.io-client";
import styles from "./Draft.module.css";

const API_BASE = window.location.origin;
const DRAFT_API_BASE = "/api/draft";
const TEAM_A_COLOR = "#ff7a6d";
const TEAM_B_COLOR = "#29b6f6";

// Character grid column order — matches SF3TS character select layout
const GRID_LEFT   = ["Akuma",  "Urien",  "Necro",   "Ibuki",  "Sean",   "Alex"];
const GRID_CENTER = ["Yun",    "Remy",   "Q",        "Chun-Li","Makoto", "Twelve", "Yang"];
const GRID_RIGHT  = ["Ryu",    "Oro",    "Dudley",   "Elena",  "Hugo",   "Ken"];

// ── API helpers ──────────────────────────────────────────────────────────────

async function draftPost<T = DraftState>(
  endpoint: string,
  body?: object,
): Promise<T> {
  const res = await fetch(`${DRAFT_API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

// ── Character card ────────────────────────────────────────────────────────────

type CharState = "normal" | "banned" | "pickedA" | "pickedB" | "selected";

interface CharCardProps {
  char: DraftCharacter;
  state: CharState;
  onClick?: () => void;
  size?: number;
  defeated?: boolean;
}

function CharCard({
  char,
  state,
  onClick,
  size = 90,
  defeated = false,
}: CharCardProps) {
  const isBanned      = state === "banned";
  const isPickedA     = state === "pickedA";
  const isPickedB     = state === "pickedB";
  const isSelected    = state === "selected";
  const isClickable   = Boolean(onClick);

  const borderColor = isSelected ? "#fff"
    : isPickedA ? TEAM_A_COLOR
    : isPickedB ? TEAM_B_COLOR
    : "transparent";

  const boxShadow = isSelected ? "0 0 20px rgba(255,255,255,0.8)"
    : isPickedA ? `0 0 12px ${TEAM_A_COLOR}`
    : isPickedB ? `0 0 12px ${TEAM_B_COLOR}`
    : "none";

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      title={char.displayName}
      className={`${styles.charCard} ${isClickable ? styles.charCardClickable : ""}`}
      style={{
        width: size,
        height: size,
        borderColor,
        boxShadow,
        opacity: isBanned || defeated ? 0.35 : 1,
        filter: isBanned || defeated ? "grayscale(1) brightness(0.6)" : "none",
      }}
    >
      <img src={`${API_BASE}${char.imagePath}`} alt={char.displayName} draggable={false} className={styles.charCardImg} />
      <div className={styles.charCardLabel}>{char.displayName}</div>
      {isSelected && <div className={styles.charCardSelectedOverlay} />}
    </div>
  );
}

// ── Oval card — main character selection grid ────────────────────────────────

interface OvalCardProps {
  char: DraftCharacter;
  state: CharState;
  onClick?: () => void;
  rowIndex?: number;
  maxRowIndex?: number;
}

function OvalCard({ char, state, onClick, rowIndex = 0, maxRowIndex = 0 }: OvalCardProps) {
  const isBanned      = state === "banned";
  const isPickedA     = state === "pickedA";
  const isPickedB     = state === "pickedB";
  const isSelected    = state === "selected";
  const isUnavailable = isBanned || isPickedA || isPickedB;
  const isClickable   = !isUnavailable && !!onClick;

  const stateClass = isBanned   ? styles.ovalCardBanned
    : isPickedA                 ? styles.ovalCardPicked
    : isPickedB                 ? styles.ovalCardPicked
    : isSelected                ? styles.ovalCardSelected
    : "";

  const teamColor = isPickedA ? TEAM_A_COLOR : isPickedB ? TEAM_B_COLOR : undefined;

  const slantVars = { "--row-index": rowIndex, "--max-row-index": maxRowIndex } as React.CSSProperties;
  const teamColorVar = teamColor ? { "--team-color": teamColor } as React.CSSProperties : {};

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      title={char.displayName}
      className={`${styles.ovalCard} ${isClickable ? styles.ovalCardClickable : ""} ${stateClass}`}
      style={{ ...slantVars, ...teamColorVar }}
    >
      <div className={styles.ovalClip}>
        <img src={`${API_BASE}${char.imagePath}`} alt={char.displayName} draggable={false} className={styles.ovalImg} />
      </div>
    </div>
  );
}

// ── Slot row ──────────────────────────────────────────────────────────────────

function SlotRow({
  chars,
  count,
  type,
  team,
  defeated,
  onToggleDefeated,
}: {
  chars: DraftCharacter[];
  count: number;
  type: "pick" | "ban";
  team: "A" | "B";
  defeated: Set<string>;
  onToggleDefeated?: (codename: string) => void;
}) {
  const slots = Array.from({ length: count }, (_, i) => chars[i] ?? null);
  return (
    <div className={styles.slotRow}>
      {slots.map((c, i) => c
        ? <CharCard
            key={c.codename}
            char={c}
            state={type === "pick" ? (team === "A" ? "pickedA" : "pickedB") : "banned"}
            size={52}
            defeated={defeated.has(c.codename)}
            onClick={
              type === "pick" && onToggleDefeated
                ? () => onToggleDefeated(c.codename)
                : undefined
            }
          />
        : <div key={i} className={styles.emptySlot} style={{ width: 52, height: 52 }} />
      )}
    </div>
  );
}

// ── Team column ───────────────────────────────────────────────────────────────

function TeamColumn({
  name,
  color,
  picks,
  bans,
  pickSlots,
  banSlots,
  allChars,
  isActive,
  defeated,
  onToggleDefeated,
}: {
  name: string; color: string; picks: string[]; bans: string[];
  pickSlots: number; banSlots: number; allChars: DraftCharacter[]; isActive: boolean;
  defeated: Set<string>;
  onToggleDefeated?: (codename: string) => void;
}) {
  const findChar = (codename: string) => allChars.find(c => c.codename === codename)!;
  const team = color === TEAM_A_COLOR ? "A" : "B";
  return (
    <div className={`${styles.teamColumn} ${isActive ? styles.teamColumnActive : ""}`} style={{ "--team-color": color } as React.CSSProperties}>
      <div className={styles.teamColumnName}>
        {name}
        {isActive && <span className={styles.turnBadge}>YOUR TURN</span>}
      </div>
      <div className={styles.sectionLabel}>Picks</div>
      <SlotRow
        chars={picks.map(findChar).filter(Boolean)}
        count={pickSlots}
        type="pick"
        team={team as "A" | "B"}
        defeated={defeated}
        onToggleDefeated={onToggleDefeated}
      />
      <div className={styles.sectionLabel}>Bans</div>
      <SlotRow
        chars={bans.map(findChar).filter(Boolean)}
        count={banSlots}
        type="ban"
        team={team as "A" | "B"}
        defeated={new Set()}
      />
    </div>
  );
}

// ── Idle phase ────────────────────────────────────────────────────────────────

function IdlePhase({ error }: { error: string | null }) {
  return (
    <div className={styles.idleRoot}>
      <div className={styles.idleTitle}>SF3TS 3v3 DRAFT</div>
      <p>Start a character draft from a match in the tournament dashboard.</p>
      <a href="/" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}>
        Open Tournament Dashboard
      </a>
      {error && <div className={styles.errorBar}>{error}</div>}
    </div>
  );
}

// ── RPS phase ─────────────────────────────────────────────────────────────────

function RpsPhase({ state, onWinner }: { state: DraftState; onWinner: (w: 1 | 2) => void }) {
  const t1 = state.pendingTeam1Name || "Team 1";
  const t2 = state.pendingTeam2Name || "Team 2";
  return (
    <div className={styles.rpsRoot}>
      <div className={styles.rpsTitle}>Who won Rock Paper Scissors?</div>
      <div className={styles.rpsSubtitle}>The RPS winner goes first in the draft.</div>
      <div className={styles.rpsBtns}>
        <button onClick={() => onWinner(1)} className={`${styles.btn} ${styles.btnTeam} ${styles.btnXlarge}`} style={{ "--team-color": TEAM_A_COLOR } as React.CSSProperties}>{t1}</button>
        <button onClick={() => onWinner(2)} className={`${styles.btn} ${styles.btnTeam} ${styles.btnXlarge}`} style={{ "--team-color": TEAM_B_COLOR } as React.CSSProperties}>{t2}</button>
      </div>
    </div>
  );
}

// ── Main Draft Component ─────────────────────────────────────────────────────

/** How many consecutive actions the current team has from a given step in the order array. */
function getTurnLength(order: number[], step: number, team: number): number {
  let n = 0;
  for (let i = step; i < order.length && order[i] === team; i++) n++;
  return n;
}

/** Walk backwards to find where the current team's consecutive run started. */
function getTurnStartStep(order: number[], step: number, team: number): number {
  let s = step;
  while (s > 0 && order[s - 1] === team) s--;
  return s;
}

export default function Draft() {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    // Don't reset selectedChars on socket updates — staging is local until lock-in
    socket.on("draft:update", (state: DraftState) => { setDraft(state); });
    socket.on("connect_error", () => setError("Cannot connect to server"));
    fetch(DRAFT_API_BASE)
      .then(r => r.json())
      .then(setDraft)
      .catch((error: unknown) => setError(getErrorMessage(error)));
    return () => { socket.disconnect(); };
  }, []);

  const handleRpsWinner  = useCallback(async (w: 1 | 2) => {
    try {
      await draftPost("/rps-winner", { winner: w });
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);

  const handleToggleChar = useCallback((codename: string) => {
    if (!draft) return;
    // Replace current staged char; clicking the same char deselects
    const newChars = selectedChars[0] === codename ? [] : [codename];
    setSelectedChars(newChars);
    if (draft.phase === "ban" || draft.phase === "pick") {
      draftPost("/stage", { codenames: newChars, action: draft.phase })
        .catch((error: unknown) => setError(getErrorMessage(error)));
    }
  }, [selectedChars, draft]);

  const handleLockIn = useCallback(async () => {
    if (selectedChars.length === 0 || !draft) return;
    try {
      await draftPost("/lock-in", { codenames: selectedChars });
      setSelectedChars([]);
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
      setSelectedChars([]);
    }
  }, [selectedChars, draft]);

  const handleUndo = useCallback(async () => {
    try {
      await draftPost("/undo");
      setSelectedChars([]);
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);
  const handleRedo = useCallback(async () => {
    try {
      await draftPost("/redo");
      setSelectedChars([]);
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);
  const handleRestart = useCallback(async () => {
    try {
      await draftPost("/restart");
      setSelectedChars([]);
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);
  const handleToggleDefeated = useCallback(async (
    team: 0 | 1,
    codename: string,
  ) => {
    try {
      const result = await draftPost<{ draft: DraftState }>(
        "/defeat",
        { team, codename },
      );
      setDraft(result.draft);
      setError(null);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);

  if (!draft) return <div className={styles.connecting}>Connecting…</div>;

  const { phase, ruleset } = draft;

  if (phase === "idle") return <div className={styles.root}><IdlePhase error={error} /></div>;
  if (phase === "rps")  return <div className={styles.root}><RpsPhase state={draft} onWinner={handleRpsWinner} /></div>;
  if (!ruleset)         return null;

  const {
    teamAName,
    teamBName,
    teamABans,
    teamBBans,
    teamAPicks,
    teamBPicks,
    teamADefeated,
    teamBDefeated,
    currentTeam,
    currentStep,
    canUndo,
    canRedo,
  } = draft;
  const allChars  = ruleset.characters;
  const allBanned = new Set([...teamABans, ...teamBBans]);
  const bansPerTeam = { a: 0, b: 0 };
  ruleset.banOrder.forEach(t => t === 0 ? bansPerTeam.a++ : bansPerTeam.b++);

  const order = phase === "ban" ? ruleset.banOrder : phase === "pick" ? ruleset.pickOrder : [];
  const hasSelection = selectedChars.length > 0;

  // Compute position within multi-char turns for the prompt (e.g. "ban 2 of 2")
  const turnStart = (phase === "ban" || phase === "pick") && currentTeam !== null
    ? getTurnStartStep(order, currentStep, currentTeam) : 0;
  const totalTurnLength = (phase === "ban" || phase === "pick") && currentTeam !== null
    ? getTurnLength(order, turnStart, currentTeam) : 0;
  const turnPos   = currentStep - turnStart + 1;
  const posLabel  = totalTurnLength > 1 ? ` (${turnPos} of ${totalTurnLength})` : "";

  const actingColor = currentTeam === 0 ? TEAM_A_COLOR : currentTeam === 1 ? TEAM_B_COLOR : "#888";
  const actingName  = currentTeam === 0 ? teamAName    : currentTeam === 1 ? teamBName    : "";
  const prompt = phase === "complete"
    ? "Draft complete — click a drafted character to toggle defeated"
    : hasSelection
      ? `${actingName}: Lock in ${selectedChars.map(cn => allChars.find(c => c.codename === cn)?.displayName).join(", ")}`
      : phase === "ban"
        ? `${actingName}: Select a ban${posLabel}`
        : `${actingName}: Select a character${posLabel}`;

  function getCharState(codename: string): CharState {
    if (allBanned.has(codename))          return "banned";
    if (teamAPicks.includes(codename))    return "pickedA";
    if (teamBPicks.includes(codename))    return "pickedB";
    if (selectedChars.includes(codename)) return "selected";
    return "normal";
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerMatchup}>
          <span style={{ color: TEAM_A_COLOR }}>{teamAName}</span>
          <span style={{ color: "#444", margin: "0 8px" }}>vs</span>
          <span style={{ color: TEAM_B_COLOR }}>{teamBName}</span>
        </div>
        <div className={styles.headerPrompt} style={{ color: actingColor }}>{prompt}</div>
        <div className={styles.headerActions}>
          <button onClick={handleUndo}    disabled={!canUndo} className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}>↩ Undo</button>
          <button onClick={handleRedo}    disabled={!canRedo} className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}>↪ Redo</button>
          <button onClick={handleRestart}                     className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}>↺ Restart</button>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.sidebar}>
          <TeamColumn
            name={teamAName}
            color={TEAM_A_COLOR}
            picks={teamAPicks}
            bans={teamABans}
            pickSlots={ruleset.teamSize}
            banSlots={bansPerTeam.a}
            allChars={allChars}
            isActive={currentTeam === 0}
            defeated={new Set(teamADefeated)}
            onToggleDefeated={
              phase === "complete"
                ? (codename) => handleToggleDefeated(0, codename)
                : undefined
            }
          />
        </div>
        <div className={styles.gridArea}>
          <div className={styles.charGrid}>
            {([
              { codenames: GRID_LEFT,   colClass: `${styles.gridCol} ${styles.gridColLeft}` },
              { codenames: GRID_CENTER, colClass: `${styles.gridCol} ${styles.gridColCenter}` },
              { codenames: GRID_RIGHT,  colClass: `${styles.gridCol} ${styles.gridColRight}` },
            ] as const).map(({ codenames, colClass }, colIdx) => (
              <div key={colIdx} className={colClass}>
                {codenames.map((codename, rowIndex) => {
                  const c = allChars.find(ch => ch.codename === codename);
                  if (!c) return null;
                  const cstate = getCharState(c.codename);
                  const canSelect = cstate === "normal" || cstate === "selected";
                  const isClickable = (phase === "ban" || phase === "pick") && canSelect;
                  return (
                    <OvalCard key={c.codename} char={c} state={cstate}
                      rowIndex={rowIndex}
                      maxRowIndex={codenames.length - 1}
                      onClick={isClickable ? () => handleToggleChar(c.codename) : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {hasSelection && (
            <div className={styles.confirmRow}>
              <button onClick={handleLockIn} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}>
                Lock in {selectedChars.map(cn => allChars.find(c => c.codename === cn)?.displayName).join(" + ")}
              </button>
            </div>
          )}
        </div>
        <div className={styles.sidebarRight}>
          <TeamColumn
            name={teamBName}
            color={TEAM_B_COLOR}
            picks={teamBPicks}
            bans={teamBBans}
            pickSlots={ruleset.teamSize}
            banSlots={bansPerTeam.b}
            allChars={allChars}
            isActive={currentTeam === 1}
            defeated={new Set(teamBDefeated)}
            onToggleDefeated={
              phase === "complete"
                ? (codename) => handleToggleDefeated(1, codename)
                : undefined
            }
          />
        </div>
      </div>

      {error && (
        <div className={styles.errorBar}>
          {error}
          <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
