import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  clearScoreboardMatch,
  createOfflineMatch,
  getAppState,
  getConfig,
  hideScoreboard,
  refreshStartGG,
  resetScore,
  saveConfig,
  saveResult,
  saveScoreboardSettings,
  saveStartggApiToken,
  selectScoreboardMatch,
  showScoreboard,
  startCharacterDraft,
  startMatch,
  submitFinalResult,
  swapScoreboardPlayers,
  toggleDraftDefeat,
  updateOfflineMatch,
  updateScoreDelta,
} from "./api";
import SettingsPane from "./SettingsPane";
import type { ScoreboardSettings } from "./scoreboardSettings";
import {
  getSettingsChanges,
  mergeSettingsChanges,
  type SettingsChanges,
} from "./settingsChanges";
import { reconcileOfflineInput, type OfflineDetails } from "./offlineDetails";
import type { DraftState } from "./draftTypes";
import type { Match, TournamentStream } from "./types";

type AppMode = "startgg" | "offline";
type SetupView = "choice" | AppMode;
type ScoreboardDisplay = { visible: boolean; swapped: boolean };
type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type ServerAppState = {
  mode: AppMode | null;
  matchesData: Record<string, Match>;
  streamsData: TournamentStream[];
  draftData: DraftState;
};

type CountryFlagOption = {
  code: string;
  name: string;
  flag: string;
};

function countryCodeToFlag(countryCode: string) {
  return [...countryCode]
    .map((character) =>
      String.fromCodePoint(character.charCodeAt(0) + 127397),
    )
    .join("");
}

const ISO_COUNTRY_CODES = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
  BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
  DE DJ DK DM DO DZ
  EC EE EG EH ER ES ET
  FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
  HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT
  JE JM JO JP
  KE KG KH KI KM KN KP KR KW KY KZ
  LA LB LC LI LK LR LS LT LU LV LY
  MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
  NA NC NE NF NG NI NL NO NP NR NU NZ
  OM
  PA PE PF PG PH PK PL PM PN PR PS PT PW PY
  QA
  RE RO RS RU RW
  SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
  TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
  UA UG UM US UY UZ
  VA VC VE VG VI VN VU
  WF WS
  YE YT
  ZA ZM ZW
`.trim().split(/\s+/);

const COUNTRY_FLAG_OPTIONS: CountryFlagOption[] = (() => {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  return ISO_COUNTRY_CODES.map((code) => ({
    code,
    name: displayNames.of(code) ?? code,
    flag: countryCodeToFlag(code),
  })).sort((left, right) => left.name.localeCompare(right.name));
})();

type OfflinePlayerFieldsProps = {
  idPrefix: string;
  label: string;
  name: string;
  sponsor: string;
  country: string;
  autoFocus?: boolean;
  onNameChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onCountryChange: (value: string) => void;
};

type FlagPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function FlagPicker({ label, value, onChange }: FlagPickerProps) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedFlag =
    COUNTRY_FLAG_OPTIONS.find((option) => option.code === value)?.flag ?? "";
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? COUNTRY_FLAG_OPTIONS.filter(
        (option) =>
          option.code.toLocaleLowerCase().includes(normalizedQuery) ||
          option.name.toLocaleLowerCase().includes(normalizedQuery),
      )
    : COUNTRY_FLAG_OPTIONS;

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  const selectCountry = (country: string) => {
    onChange(country);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      className="offline-flag-picker"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <button
        className="offline-flag-picker-trigger"
        type="button"
        aria-label={`${label} country flag`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setQuery("");
            setOpen(false);
            return;
          }

          const bounds = rootRef.current?.getBoundingClientRect();
          setOpensUp(
            Boolean(
              bounds &&
              bounds.bottom + 280 > window.innerHeight &&
              bounds.top > 280,
            ),
          );
          setOpen(true);
        }}
      >
        {selectedFlag || "\u00a0"}
      </button>
      {open && (
        <div
          className={`offline-flag-options ${
            opensUp ? "opens-up" : ""
          }`}
        >
          <input
            className="offline-flag-search"
            ref={searchInputRef}
            type="search"
            value={query}
            aria-label="Filter countries"
            placeholder="Country or code"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            className="offline-flag-grid"
            role="listbox"
            aria-label={`${label} country flags`}
          >
            <button
              className="offline-flag-option offline-flag-option-clear"
              type="button"
              role="option"
              aria-label="No country flag"
              aria-selected={!value}
              title="No country flag"
              onClick={() => selectCountry("")}
            >
              &times;
            </button>
            {filteredOptions.map((option) => (
              <button
                className="offline-flag-option"
                type="button"
                role="option"
                key={option.code}
                aria-label={`${option.name} (${option.code})`}
                aria-selected={value === option.code}
                title={`${option.name} (${option.code})`}
                onClick={() => selectCountry(option.code)}
              >
                {option.flag}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <p className="offline-flag-empty">No countries found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OfflinePlayerFields({
  idPrefix,
  label,
  name,
  sponsor,
  country,
  autoFocus = false,
  onNameChange,
  onSponsorChange,
  onCountryChange,
}: OfflinePlayerFieldsProps) {
  return (
    <>
      <span className="field-label" id={`${idPrefix}-label`}>
        {label}
      </span>
      <div
        className="offline-player-fields"
        aria-labelledby={`${idPrefix}-label`}
      >
        <FlagPicker
          label={label}
          value={country}
          onChange={onCountryChange}
        />
        <input
          className="offline-player-sponsor"
          type="text"
          value={sponsor}
          maxLength={100}
          aria-label={`${label} sponsor tag`}
          placeholder="Sponsor"
          onChange={(event) => onSponsorChange(event.target.value)}
        />
        <input
          className="offline-player-name"
          type="text"
          value={name}
          aria-label={`${label} name`}
          placeholder={`${label} name`}
          autoFocus={autoFocus}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
    </>
  );
}

function getStatusLabel(status: Match["status"]) {
  const labels: Record<Match["status"], string> = {
    idle: "Queued",
    live: "Live",
    saved: "Saved",
    complete: "Complete",
  };

  return labels[status];
}

function getDraftPhaseLabel(phase: DraftState["phase"]) {
  const labels: Record<DraftState["phase"], string> = {
    idle: "Not started",
    rps: "Rock Paper Scissors",
    ban: "Bans",
    pick: "Picks",
    complete: "Draft complete",
  };
  return labels[phase];
}

type DraftTeamControlsProps = {
  label: string;
  team: 0 | 1;
  picks: string[];
  defeated: string[];
  draft: DraftState;
  canToggle: boolean;
  onToggle: (team: 0 | 1, codename: string) => void;
};

function DraftTeamControls({
  label,
  team,
  picks,
  defeated,
  draft,
  canToggle,
  onToggle,
}: DraftTeamControlsProps) {
  const characters = picks
    .map((codename) =>
      draft.ruleset?.characters.find(
        (character) => character.codename === codename,
      ),
    )
    .filter((character) => character !== undefined);
  const defeatedSet = new Set(defeated);

  return (
    <div className="draft-team-controls">
      <strong>{label}</strong>
      <div className="draft-character-buttons">
        {characters.map((character) => {
          const isDefeated = defeatedSet.has(character.codename);
          return (
            <button
              className={`draft-character-button ${
                isDefeated ? "is-defeated" : ""
              }`}
              type="button"
              key={character.codename}
              disabled={!canToggle}
              aria-pressed={isDefeated}
              title={
                canToggle
                  ? `${isDefeated ? "Restore" : "Defeat"} ${character.displayName}`
                  : character.displayName
              }
              onClick={() => onToggle(team, character.codename)}
            >
              <img src={character.imagePath} alt="" />
              <span>{character.displayName}</span>
            </button>
          );
        })}
        {characters.length === 0 && (
          <span className="draft-character-empty">No characters drafted yet</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [streams, setStreams] = useState<TournamentStream[]>([]);
  const [mode, setMode] = useState<AppMode | null>(null);
  const [setupView, setSetupView] = useState<SetupView>("choice");
  const [hasSavedToken, setHasSavedToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [player1Input, setPlayer1Input] = useState("");
  const [player1SponsorInput, setPlayer1SponsorInput] = useState("");
  const [player1CountryInput, setPlayer1CountryInput] = useState("");
  const [player2Input, setPlayer2Input] = useState("");
  const [player2SponsorInput, setPlayer2SponsorInput] = useState("");
  const [player2CountryInput, setPlayer2CountryInput] = useState("");
  const [matchLabelInput, setMatchLabelInput] = useState("Offline Match");
  const [scoreboardUrl, setScoreboardUrl] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [selectedStartggStreamId, setSelectedStartggStreamId] = useState("");
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [scoreboardDisplay, setScoreboardDisplay] =
    useState<ScoreboardDisplay>({ visible: true, swapped: false });
  const [scoreboardSettings, setScoreboardSettings] =
    useState<ScoreboardSettings | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [scoreboardDefaults, setScoreboardDefaults] =
    useState<ScoreboardSettings | null>(null);
  const [configLoadFailed, setConfigLoadFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [settingsSaveState, setSettingsSaveState] =
    useState<SettingsSaveState>("idle");
  const settingsSaveTimerRef = useRef<number | null>(null);
  const latestScoreboardSettingsRef = useRef<ScoreboardSettings | null>(null);
  const settingsSaveInFlightRef = useRef(false);
  const pendingSettingsChangesRef = useRef<SettingsChanges>({});
  const inFlightSettingsChangesRef = useRef<SettingsChanges>({});
  const serverScoreboardSettingsRef = useRef<ScoreboardSettings | null>(null);
  const scoreboardRevisionRef = useRef(-1);
  const previousOfflineDetailsRef = useRef<OfflineDetails | null>(null);
  const previousServerModeRef = useRef<AppMode | null | undefined>(undefined);

  const currentMatch =
    Object.values(matches).find((match) => match.isScoreboardMatch) ?? null;
  const playersSwapped = scoreboardDisplay.swapped ?? false;
  const scoreboardVisible = scoreboardDisplay.visible ?? true;
  const displayedPlayer1 = currentMatch
    ? playersSwapped
      ? currentMatch.player2
      : currentMatch.player1
    : null;
  const displayedPlayer2 = currentMatch
    ? playersSwapped
      ? currentMatch.player1
      : currentMatch.player2
    : null;
  const displayedScore1 = currentMatch
    ? playersSwapped
      ? currentMatch.score2
      : currentMatch.score1
    : 0;
  const displayedScore2 = currentMatch
    ? playersSwapped
      ? currentMatch.score1
      : currentMatch.score2
    : 0;
  const currentDraft =
    currentMatch &&
    draft?.matchId === currentMatch.id &&
    draft.phase !== "idle"
      ? draft
      : null;
  const displayedDraftTeam1 = currentDraft
    ? playersSwapped
      ? {
          team: 1 as const,
          picks: currentDraft.teamBPicks,
          defeated: currentDraft.teamBDefeated,
        }
      : {
          team: 0 as const,
          picks: currentDraft.teamAPicks,
          defeated: currentDraft.teamADefeated,
        }
    : null;
  const displayedDraftTeam2 = currentDraft
    ? playersSwapped
      ? {
          team: 0 as const,
          picks: currentDraft.teamAPicks,
          defeated: currentDraft.teamADefeated,
        }
      : {
          team: 1 as const,
          picks: currentDraft.teamBPicks,
          defeated: currentDraft.teamBDefeated,
        }
    : null;

  const availableMatches = Object.values(matches).filter(
    (match) =>
      match &&
      match.player1 &&
      match.player2 &&
      !match.isScoreboardMatch &&
      match.status !== "complete",
  );

  const loadingStateComponent = (text: string) => (
    <div className="busy-overlay">
      <div className="busy-card">
        <span className="busy-spinner" />
        <span>{text}</span>
      </div>
    </div>
  );

  const emptyScoreboardMatchComponent = (
    title = "No match selected",
    description = "Choose a set from the queue to show it on the scoreboard.",
  ) => (
    <div className="empty-state">
      <div className="empty-icon">+</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );

  const applyServerAppState = useCallback((state: ServerAppState) => {
    const nextMatches = state.matchesData ?? {};
    const nextStreams = state.streamsData ?? [];
    const offlineMatch = nextMatches["offline-match"];

    setMatches(nextMatches);
    setStreams(nextStreams);
    setDraft(state.draftData);
    setSelectedStartggStreamId((previousStreamId) => {
      return nextStreams.some((stream) => stream.id === previousStreamId)
        ? previousStreamId
        : "";
    });

    if (state.mode === "offline" && offlineMatch) {
      const previous = previousOfflineDetailsRef.current;
      setPlayer1Input((draft) => reconcileOfflineInput(
        draft, previous?.player1.name, offlineMatch.player1.name,
      ));
      setPlayer1SponsorInput((draft) => reconcileOfflineInput(
        draft,
        previous ? previous.player1.sponsor ?? "" : undefined,
        offlineMatch.player1.sponsor ?? "",
      ));
      setPlayer1CountryInput((draft) => reconcileOfflineInput(
        draft,
        previous ? previous.player1.country ?? "" : undefined,
        offlineMatch.player1.country ?? "",
      ));
      setPlayer2Input((draft) => reconcileOfflineInput(
        draft, previous?.player2.name, offlineMatch.player2.name,
      ));
      setPlayer2SponsorInput((draft) => reconcileOfflineInput(
        draft,
        previous ? previous.player2.sponsor ?? "" : undefined,
        offlineMatch.player2.sponsor ?? "",
      ));
      setPlayer2CountryInput((draft) => reconcileOfflineInput(
        draft,
        previous ? previous.player2.country ?? "" : undefined,
        offlineMatch.player2.country ?? "",
      ));
      setMatchLabelInput((draft) => reconcileOfflineInput(
        draft, previous?.round, offlineMatch.round || "Offline Match",
      ));
      previousOfflineDetailsRef.current = offlineMatch;
    } else {
      previousOfflineDetailsRef.current = null;
    }

    if (previousServerModeRef.current !== state.mode) {
      setMode(state.mode);
      previousServerModeRef.current = state.mode;
    }
  }, []);

  const refreshFromStartGG = async () => {
    setIsBusy(true);

    try {
      const result = await refreshStartGG();
      const nextMatches = result.matchesData ?? result.matches;
      const nextStreams = (result.streamsData ??
        result.streams ??
        []) as TournamentStream[];

      setStreams(nextStreams);

      if (nextMatches) {
        setMatches(nextMatches);

        setSelectedStartggStreamId((previousStreamId) => {
          const previousStreamStillExists = nextStreams.some(
            (stream) => stream.id === previousStreamId,
          );

          return previousStreamStillExists
            ? previousStreamId
            : "";
        });
      }
    } catch (error) {
      console.error("Error refreshing start.gg data:", error);
      alert("Failed to load this start.gg tournament.");
    } finally {
      setIsBusy(false);
    }
  };

  const clearCurrentScoreboardMatch = async () => {
    if (!currentMatch) return;

    setIsBusy(true);

    try {
      const updatedMatch = await clearScoreboardMatch(currentMatch.id);
      setMatches((previousMatches) => ({
        ...previousMatches,
        [updatedMatch.id]: updatedMatch,
      }));
    } catch (error) {
      console.error("Error clearing scoreboard match:", error);
      alert("Failed to clear the scoreboard match.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setIsBusy(true);

    try {
      await saveConfig(tokenInput.trim() || undefined, slugInput);
      setHasSavedToken(true);
      setMode("startgg");
      await refreshFromStartGG();
    } catch (error) {
      console.error("Failed to save start.gg configuration:", error);
      alert("Failed to save the start.gg tournament configuration.");
    } finally {
      setSavingConfig(false);
      setIsBusy(false);
    }
  };

  const handleCreateOfflineMatch = async () => {
    setIsBusy(true);

    try {
      const result = await createOfflineMatch(
        player1Input,
        player1SponsorInput,
        player1CountryInput,
        player2Input,
        player2SponsorInput,
        player2CountryInput,
        matchLabelInput,
      );
      const nextStreams = result.streamsData as TournamentStream[];
      const offlineMatch = result.matchesData?.["offline-match"] as
        | Match
        | undefined;

      if (!offlineMatch) {
        throw new Error("Offline match was not returned by the server");
      }

      setMatches(result.matchesData);
      setStreams(nextStreams);
      setSelectedStartggStreamId("");
      setPlayer1Input(offlineMatch.player1.name);
      setPlayer1SponsorInput(offlineMatch.player1.sponsor ?? "");
      setPlayer1CountryInput(offlineMatch.player1.country ?? "");
      setPlayer2Input(offlineMatch.player2.name);
      setPlayer2SponsorInput(offlineMatch.player2.sponsor ?? "");
      setPlayer2CountryInput(offlineMatch.player2.country ?? "");
      setMatchLabelInput(
        offlineMatch.round ?? "Offline Match",
      );
      setMode("offline");
    } catch (error) {
      console.error("Failed to create offline match:", error);
      alert("Failed to start offline mode.");
    } finally {
      setIsBusy(false);
    }
  };

  const updateMatchState = (updatedMatch: Match) => {
    setMatches((previousMatches) => ({
      ...previousMatches,
      [updatedMatch.id]: updatedMatch,
    }));
  };

  const handleMatchScoreDelta = async (
    match: Match,
    player: 1 | 2,
    delta: -1 | 1,
  ) => {
    try {
      await updateScoreDelta(match.id, player, delta);
    } catch (error) {
      console.error("Failed to update score:", error);
      alert("Failed to update the score.");
    }
  };

  const handleStartMatch = async (match: Match) => {
    setIsBusy(true);
    try {
      updateMatchState(await startMatch(match.id));
    } catch (error) {
      console.error("Failed to start match:", error);
      alert("Failed to start the match.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveMatch = async (match: Match) => {
    setIsBusy(true);
    try {
      updateMatchState(await saveResult(match.id));
    } catch (error) {
      console.error("Failed to save match result:", error);
      alert("Failed to save the match result.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitMatch = async (match: Match) => {
    if (!window.confirm("Submit this final result to start.gg?")) return;

    setIsBusy(true);
    try {
      updateMatchState(await submitFinalResult(match.id));
      setExpandedMatchId((expandedId) =>
        expandedId === match.id ? null : expandedId,
      );
      await refreshFromStartGG();
    } catch (error) {
      console.error("Failed to submit final match result:", error);
      alert("Failed to submit the final match result.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectScoreboardMatch = async (match: Match) => {
    setIsBusy(true);
    try {
      await selectScoreboardMatch(
        match.id,
        selectedStartggStreamId || undefined,
      );
      setExpandedMatchId((expandedId) =>
        expandedId === match.id ? null : expandedId,
      );
    } catch (error) {
      console.error("Failed to select scoreboard match:", error);
      alert("Failed to show the match on the scoreboard.");
    } finally {
      setIsBusy(false);
    }
  };

  const openDraftController = () => {
    window.open("/draft", "_blank");
  };

  const handleStartCharacterDraft = async (match: Match) => {
    setIsBusy(true);
    try {
      const result = await startCharacterDraft(
        match.id,
        mode === "startgg"
          ? selectedStartggStreamId || undefined
          : undefined,
      );
      setDraft(result.draft);
      updateMatchState(result.match);
      setExpandedMatchId((expandedId) =>
        expandedId === match.id ? null : expandedId,
      );
    } catch (error) {
      console.error("Failed to start character draft:", error);
      alert("Failed to start the character draft.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleDraftCharacter = async (
    team: 0 | 1,
    codename: string,
  ) => {
    try {
      const result = await toggleDraftDefeat(team, codename);
      setDraft(result.draft);
      updateMatchState(result.match);
    } catch (error) {
      console.error("Failed to update defeated character:", error);
      alert("Failed to update the defeated character.");
    }
  };

  const handleDisplayedScoreDelta = async (
    player: 1 | 2,
    delta: -1 | 1,
  ) => {
    if (!currentMatch) return;
    const storedPlayer = playersSwapped ? (player === 1 ? 2 : 1) : player;
    await handleMatchScoreDelta(currentMatch, storedPlayer, delta);
  };

  const handleUpdateOfflineMatch = async () => {
    setIsBusy(true);

    try {
      const updatedMatch = await updateOfflineMatch(
        player1Input,
        player1SponsorInput,
        player1CountryInput,
        player2Input,
        player2SponsorInput,
        player2CountryInput,
        matchLabelInput,
      );
      setMatches((previousMatches) => ({
        ...previousMatches,
        [updatedMatch.id]: updatedMatch,
      }));
    } catch (error) {
      console.error("Failed to update offline match:", error);
      alert("Failed to update the offline scoreboard details.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetScore = async () => {
    if (!currentMatch) return;

    try {
      const updatedMatch = await resetScore(currentMatch.id);
      setMatches((previousMatches) => ({
        ...previousMatches,
        [updatedMatch.id]: updatedMatch,
      }));
    } catch (error) {
      console.error("Failed to reset score:", error);
      alert("Failed to reset the score.");
    }
  };

  const applyScoreboardSnapshot = useCallback((
    settings: ScoreboardSettings,
    revision: number,
  ) => {
    if (revision < scoreboardRevisionRef.current) return;
    scoreboardRevisionRef.current = revision;
    serverScoreboardSettingsRef.current = settings;
    const next = mergeSettingsChanges(
      mergeSettingsChanges(settings, inFlightSettingsChangesRef.current),
      pendingSettingsChangesRef.current,
    );
    latestScoreboardSettingsRef.current = next;
    setScoreboardSettings(next);
  }, []);

  async function persistLatestScoreboardSettings() {
    if (settingsSaveInFlightRef.current) return;

    const changesToSave = pendingSettingsChangesRef.current;
    if (!Object.keys(changesToSave).length) return;

    pendingSettingsChangesRef.current = {};
    inFlightSettingsChangesRef.current = changesToSave;
    settingsSaveInFlightRef.current = true;
    setSettingsSaveState("saving");
    let saved = false;
    let retryNewerChanges = false;

    try {
      const result = await saveScoreboardSettings(changesToSave);
      applyScoreboardSnapshot(result.scoreboard, result.scoreboardRevision);
      saved = true;
      setSettingsSaveState("saved");
    } catch (error) {
      retryNewerChanges = Object.keys(pendingSettingsChangesRef.current).length > 0;
      pendingSettingsChangesRef.current = mergeSettingsChanges(
        changesToSave,
        pendingSettingsChangesRef.current,
      );
      console.error("Failed to apply scoreboard settings:", error);
      setSettingsSaveState("error");
      alert("Failed to apply the scoreboard settings.");
    } finally {
      settingsSaveInFlightRef.current = false;
      inFlightSettingsChangesRef.current = {};
      if (serverScoreboardSettingsRef.current) {
        applyScoreboardSnapshot(
          serverScoreboardSettingsRef.current,
          scoreboardRevisionRef.current,
        );
      }

      if ((saved || retryNewerChanges) && Object.keys(pendingSettingsChangesRef.current).length) {
        void persistLatestScoreboardSettings();
      }
    }
  }

  const handleScoreboardSettingsChange = (
    nextSettings: ScoreboardSettings,
    debounce: boolean,
  ) => {
    const previous = latestScoreboardSettingsRef.current;
    if (!previous) return;
    pendingSettingsChangesRef.current = mergeSettingsChanges(
      pendingSettingsChangesRef.current,
      getSettingsChanges(previous, nextSettings),
    );
    setScoreboardSettings(nextSettings);
    latestScoreboardSettingsRef.current = nextSettings;
    setSettingsSaveState("saving");

    if (settingsSaveTimerRef.current !== null) {
      window.clearTimeout(settingsSaveTimerRef.current);
    }

    if (debounce) {
      settingsSaveTimerRef.current = window.setTimeout(() => {
        settingsSaveTimerRef.current = null;
        void persistLatestScoreboardSettings();
      }, 350);
    } else {
      settingsSaveTimerRef.current = null;
      void persistLatestScoreboardSettings();
    }
  };

  const handleSaveApiKey = async (apiToken: string) => {
    setSavingApiKey(true);

    try {
      const result = await saveStartggApiToken(apiToken);
      setHasSavedToken(Boolean(result.hasStartggToken));
      return true;
    } catch (error) {
      console.error("Failed to save start.gg API key:", error);
      alert("Failed to save the start.gg API key.");
      return false;
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleSwapPlayers = async () => {
    setIsBusy(true);

    try {
      await swapScoreboardPlayers();
    } catch (error) {
      console.error("Failed to swap scoreboard players:", error);
      alert("Failed to swap the scoreboard players.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleScoreboardVisibility = async () => {
    setIsBusy(true);

    try {
      if (scoreboardVisible) {
        await hideScoreboard();
      } else {
        await showScoreboard();
      }
    } catch (error) {
      console.error("Failed to update scoreboard visibility:", error);
      alert("Failed to update scoreboard visibility.");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    Promise.all([getConfig(), getAppState()])
      .then(([config, appState]) => {
        setHasSavedToken(Boolean(config.hasStartggToken));
        setSlugInput(config.tournamentSlug ?? "");
        applyScoreboardSnapshot(config.scoreboard, config.scoreboardRevision);
        setScoreboardDefaults(config.scoreboardDefaults);
        setScoreboardUrl(config.urls?.scoreboard ?? "");
        applyServerAppState(appState);
      })
      .catch((error) => {
        console.error("Failed to load application configuration:", error);
        setHasSavedToken(false);
        setConfigLoadFailed(true);
      });
  }, [applyServerAppState, applyScoreboardSnapshot]);

  useEffect(() => {
    const socket = io();

    socket.on("connect", () => {
      scoreboardRevisionRef.current = -1;
    });
    socket.on("app:state", applyServerAppState);
    socket.on("match:update", (updatedMatches: Record<string, Match>) => {
      setMatches(updatedMatches);
    });
    socket.on("scoreboard:display", (display: ScoreboardDisplay) => {
      setScoreboardDisplay(display);
    });
    socket.on("scoreboard:settings", applyScoreboardSnapshot);
    socket.on("draft:update", (updatedDraft: DraftState) => {
      setDraft(updatedDraft);
    });

    return () => {
      socket.disconnect();
    };
  }, [applyServerAppState, applyScoreboardSnapshot]);

  useEffect(() => {
    return () => {
      if (settingsSaveTimerRef.current !== null) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }
    };
  }, []);

  if (configLoadFailed) {
    return (
      <main className="app-shell setup-shell">
        <section className="panel setup-panel">
          <p className="eyebrow">Configuration error</p>
          <h1>Unable to load settings</h1>
          <p className="hero-copy setup-copy">
            The application could not load its saved configuration.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </section>
      </main>
    );
  }

  if (
    hasSavedToken === null ||
    scoreboardSettings === null ||
    scoreboardDefaults === null
  ) {
    return loadingStateComponent("Loading...");
  }

  if (!mode) {
    return (
      <>
        <main className="app-shell setup-shell">
          {isBusy && loadingStateComponent("Processing...")}
          <section className="panel setup-panel">
          {setupView === "choice" && (
            <>
              <p className="eyebrow">Scoreboard setup</p>
              <h1>Choose a mode</h1>
              <p className="hero-copy setup-copy">
                Connect a start.gg tournament, or run the scoreboard locally
                with player names you enter yourself.
              </p>

              <div className="mode-grid">
                <button
                  className="mode-card"
                  onClick={() => setSetupView("startgg")}
                >
                  <span className="mode-card-icon">S</span>
                  <strong>Start.gg Tournament</strong>
                  <span>
                    Load bracket matches, result tools, and optional stream
                    metadata.
                  </span>
                </button>
                <button
                  className="mode-card"
                  onClick={() => setSetupView("offline")}
                >
                  <span className="mode-card-icon">O</span>
                  <strong>Offline Mode</strong>
                  <span>Enter two players and control scores without a bracket.</span>
                </button>
              </div>
            </>
          )}

          {setupView === "startgg" && (
            <form
              className="setup-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveConfig();
              }}
            >
              <button
                type="button"
                className="back-button"
                onClick={() => setSetupView("choice")}
              >
                Back
              </button>
              <p className="eyebrow">Start.gg mode</p>
              <h1>Open a tournament</h1>
              <p className="hero-copy setup-copy">
                Paste the numeric tournament ID, slug, or start.gg tournament
                URL.
              </p>

              <label className="field-label" htmlFor="tournament-slug">
                Tournament ID or slug
              </label>
              <input
                id="tournament-slug"
                type="text"
                value={slugInput}
                onChange={(event) => setSlugInput(event.target.value)}
                placeholder="123456 or tournament/my-event"
                autoFocus
              />

              <label className="field-label" htmlFor="api-token">
                Start.gg API token {hasSavedToken ? "(optional)" : ""}
              </label>
              <input
                id="api-token"
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder={
                  hasSavedToken ? "Use saved token" : "Start.gg API token"
                }
              />

              <button
                className="button setup-submit"
                type="submit"
                disabled={
                  savingConfig ||
                  !slugInput.trim() ||
                  (!hasSavedToken && !tokenInput.trim())
                }
              >
                {savingConfig ? "Opening..." : "Open Tournament"}
              </button>
            </form>
          )}

          {setupView === "offline" && (
            <form
              className="setup-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateOfflineMatch();
              }}
            >
              <button
                type="button"
                className="back-button"
                onClick={() => setSetupView("choice")}
              >
                Back
              </button>
              <p className="eyebrow">Offline mode</p>
              <h1>Enter the players</h1>
              <p className="hero-copy setup-copy">
                The OBS scoreboard and Stream Deck score commands will use this
                match immediately.
              </p>

              <OfflinePlayerFields
                idPrefix="player-one"
                label="Player 1"
                name={player1Input}
                sponsor={player1SponsorInput}
                country={player1CountryInput}
                onNameChange={setPlayer1Input}
                onSponsorChange={setPlayer1SponsorInput}
                onCountryChange={setPlayer1CountryInput}
                autoFocus
              />

              <OfflinePlayerFields
                idPrefix="player-two"
                label="Player 2"
                name={player2Input}
                sponsor={player2SponsorInput}
                country={player2CountryInput}
                onNameChange={setPlayer2Input}
                onSponsorChange={setPlayer2SponsorInput}
                onCountryChange={setPlayer2CountryInput}
              />

              <label className="field-label" htmlFor="match-label">
                Match label
              </label>
              <input
                id="match-label"
                type="text"
                value={matchLabelInput}
                onChange={(event) => setMatchLabelInput(event.target.value)}
                placeholder="Offline Match"
              />

              <button
                className="button setup-submit"
                type="submit"
                disabled={!player1Input.trim() || !player2Input.trim()}
              >
                Start Offline Match
              </button>
            </form>
          )}
          </section>
        </main>
        <button
          className="button ghost persistent-settings-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </button>
        {settingsOpen && (
          <SettingsPane
            settings={scoreboardSettings}
            defaults={scoreboardDefaults}
            hasSavedToken={hasSavedToken}
            savingApiKey={savingApiKey}
            autoSaveState={settingsSaveState}
            onClose={() => setSettingsOpen(false)}
            onSettingsChange={handleScoreboardSettingsChange}
            onSaveApiKey={handleSaveApiKey}
          />
        )}
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        {isBusy && loadingStateComponent("Processing...")}
        <section className="hero compact-hero">
        <div>
          <p className="eyebrow">
            {mode === "offline" ? "Offline scoreboard" : "Tournament operations"}
          </p>
          <h1>
            {mode === "offline"
              ? "Scoreboard Control"
              : "Tournament Dashboard"}
          </h1>
          <p className="hero-copy">
            {mode === "offline"
              ? "Control the live scoreboard without a start.gg tournament."
              : "Assign bracket matches, update scores, and report results."}
          </p>
        </div>
        <div className="hero-actions">
          {mode === "startgg" && (
            <button className="button secondary" onClick={refreshFromStartGG}>
              Refresh from start.gg
            </button>
          )}
          <button
            className="button ghost"
            onClick={() => {
              setMode(null);
              setSetupView("choice");
            }}
          >
            Change Mode
          </button>
        </div>
      </section>

      <div className="dashboard-grid logic-first-grid">
        <section className="panel queue-panel">
          {mode === "startgg" ? (
            <>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Match queue</p>
                  <h2>Choose Scoreboard Match</h2>
                </div>
              </div>

              <label className="field-label" htmlFor="stream-select">
                Optional start.gg stream assignment
              </label>
              <select
                id="stream-select"
                value={selectedStartggStreamId}
                onChange={(event) =>
                  setSelectedStartggStreamId(event.target.value)
                }
              >
                <option value="">Do not assign a start.gg stream</option>
                {streams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.name}
                  </option>
                ))}
              </select>
              <p className="field-help">
                This only syncs start.gg metadata when a match is shown on the
                scoreboard. It does not control which match OBS displays.
              </p>

              <div className="queue-list">
                {availableMatches.length === 0 &&
                  emptyScoreboardMatchComponent(
                    "No other matches available",
                    "Refresh start.gg or wait for both entrants to be known.",
                  )}

                {availableMatches.map((match) => {
                  const assignedStream = streams.find(
                    (stream) => stream.id === match.startggStreamId,
                  );
                  const isExpanded = expandedMatchId === match.id;
                  const isDraftMatch =
                    draft?.matchId === match.id && draft.phase !== "idle";

                  return (
                    <article
                      className={`match-card ${isExpanded ? "is-expanded" : ""}`}
                      key={match.id}
                    >
                      <div className="match-card-main">
                        <div>
                          <div className="match-card-badges">
                            <span className={`pill pill-${match.status}`}>
                              {getStatusLabel(match.status)}
                            </span>
                            {match.startggStreamId && (
                              <span
                                className={`stream-indicator ${
                                  match.startggStreamId ===
                                  selectedStartggStreamId
                                    ? "is-selected"
                                    : ""
                                }`}
                              >
                                start.gg:{" "}
                                {assignedStream?.name ?? "Assigned stream"}
                              </span>
                            )}
                            {isDraftMatch && (
                              <span className="draft-indicator">
                                Character draft: {getDraftPhaseLabel(draft.phase)}
                              </span>
                            )}
                          </div>
                          <h3>
                            {match.player1?.name ?? "TBD"}{" "}
                            <span className="muted-text">vs</span>{" "}
                            {match.player2?.name ?? "TBD"}
                          </h3>
                          <p>{match.round}</p>
                        </div>
                        <div className="match-card-actions">
                          <button
                            className="button ghost"
                            onClick={() =>
                              setExpandedMatchId(isExpanded ? null : match.id)
                            }
                          >
                            {isExpanded ? "Close" : "Manage"}
                          </button>
                          <button
                            className="button"
                            onClick={() => handleSelectScoreboardMatch(match)}
                            aria-label="Show match on scoreboard"
                            title="Show on Scoreboard"
                          >
                            Show
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="queue-match-controls">
                          <div className="queue-score-grid">
                            {[
                              {
                                player: match.player1,
                                score: match.score1,
                                onDecrease: () =>
                                  handleMatchScoreDelta(match, 1, -1),
                                onIncrease: () =>
                                  handleMatchScoreDelta(match, 1, 1),
                              },
                              {
                                player: match.player2,
                                score: match.score2,
                                onDecrease: () =>
                                  handleMatchScoreDelta(match, 2, -1),
                                onIncrease: () =>
                                  handleMatchScoreDelta(match, 2, 1),
                              },
                            ].map((scoreControl) => (
                              <div
                                className="queue-player-score"
                                key={scoreControl.player.id}
                              >
                                <span>{scoreControl.player.name}</span>
                                <div className="compact-score-stepper">
                                  <button
                                    className="stepper-button"
                                    disabled={
                                      match.status === "idle" ||
                                      scoreControl.score <= 0
                                    }
                                    onClick={scoreControl.onDecrease}
                                  >
                                    -
                                  </button>
                                  <strong>{scoreControl.score}</strong>
                                  <button
                                    className="stepper-button primary"
                                    disabled={match.status === "idle"}
                                    onClick={scoreControl.onIncrease}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="queue-match-actions">
                            <button
                              className="button ghost"
                              onClick={() =>
                                isDraftMatch
                                  ? openDraftController()
                                  : handleStartCharacterDraft(match)
                              }
                            >
                              {isDraftMatch
                                ? "Open Draft Controller"
                                : draft && draft.phase !== "idle"
                                  ? "Replace Character Draft"
                                  : "Start Character Draft"}
                            </button>
                            {match.status === "idle" && (
                              <button
                                className="button"
                                onClick={() => handleStartMatch(match)}
                              >
                                Start Off-Stream Match
                              </button>
                            )}
                            {match.status !== "idle" && (
                              <>
                                <button
                                  className="button secondary"
                                  onClick={() => handleSaveMatch(match)}
                                >
                                  Save Scores
                                </button>
                                <button
                                  className="button danger"
                                  disabled={match.score1 === match.score2}
                                  onClick={() => handleSubmitMatch(match)}
                                >
                                  Submit Final Result
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="offline-summary">
              <p className="eyebrow">Scoreboard details</p>
              <h2>Edit Offline Match</h2>
              <form
                className="offline-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleUpdateOfflineMatch();
                }}
              >
                <OfflinePlayerFields
                  idPrefix="active-player-one"
                  label="Player 1"
                  name={playersSwapped ? player2Input : player1Input}
                  sponsor={
                    playersSwapped
                      ? player2SponsorInput
                      : player1SponsorInput
                  }
                  country={
                    playersSwapped
                      ? player2CountryInput
                      : player1CountryInput
                  }
                  onNameChange={
                    playersSwapped ? setPlayer2Input : setPlayer1Input
                  }
                  onSponsorChange={
                    playersSwapped
                      ? setPlayer2SponsorInput
                      : setPlayer1SponsorInput
                  }
                  onCountryChange={
                    playersSwapped
                      ? setPlayer2CountryInput
                      : setPlayer1CountryInput
                  }
                />

                <OfflinePlayerFields
                  idPrefix="active-player-two"
                  label="Player 2"
                  name={playersSwapped ? player1Input : player2Input}
                  sponsor={
                    playersSwapped
                      ? player1SponsorInput
                      : player2SponsorInput
                  }
                  country={
                    playersSwapped
                      ? player1CountryInput
                      : player2CountryInput
                  }
                  onNameChange={
                    playersSwapped ? setPlayer1Input : setPlayer2Input
                  }
                  onSponsorChange={
                    playersSwapped
                      ? setPlayer1SponsorInput
                      : setPlayer2SponsorInput
                  }
                  onCountryChange={
                    playersSwapped
                      ? setPlayer1CountryInput
                      : setPlayer2CountryInput
                  }
                />

                <label className="field-label" htmlFor="active-match-label">
                  Match label
                </label>
                <input
                  id="active-match-label"
                  type="text"
                  value={matchLabelInput}
                  onChange={(event) => setMatchLabelInput(event.target.value)}
                />

                <button
                  className="button"
                  type="submit"
                  disabled={
                    !player1Input.trim() ||
                    !player2Input.trim() ||
                    !matchLabelInput.trim()
                  }
                >
                  Update Scoreboard
                </button>
              </form>
              <p className="offline-help">
                OBS overlay: <code>{scoreboardUrl}</code>
              </p>
            </div>
          )}
        </section>

        <section className="panel control-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live scoreboard</p>
              <h2>Scoreboard Control</h2>
            </div>
            <div className="panel-header-actions">
              <button
                className={`button compact-action ${
                  scoreboardVisible ? "ghost" : "danger"
                }`}
                disabled={!currentMatch}
                onClick={handleScoreboardVisibility}
                aria-label={
                  scoreboardVisible ? "Hide scoreboard" : "Show scoreboard"
                }
                title={
                  scoreboardVisible ? "Hide scoreboard" : "Show scoreboard"
                }
              >
                {scoreboardVisible ? "Hide" : "Show"}
              </button>
              {mode === "startgg" && (
                <button
                  className="button ghost compact-action"
                  disabled={!currentMatch}
                  onClick={clearCurrentScoreboardMatch}
                  aria-label="Clear scoreboard match"
                  title="Clear scoreboard match"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {!currentMatch && emptyScoreboardMatchComponent()}

          {currentMatch && (
            <div className="control-stack">
              <article className="versus-card">
                <div className="match-meta-row">
                  <span className={`pill pill-${currentMatch.status}`}>
                    {getStatusLabel(currentMatch.status)}
                  </span>
                  <span className="round-label">{currentMatch.round}</span>
                </div>

                <div className="players-grid">
                  <div
                    className={`player-score ${
                      displayedScore1 > displayedScore2
                        ? "is-leading"
                        : ""
                    }`}
                  >
                    <span>{displayedPlayer1?.name ?? "TBD"}</span>
                    <strong>{displayedScore1}</strong>

                    <div className="score-stepper">
                      <button
                        className="stepper-button"
                        disabled={
                          currentMatch.status === "idle" ||
                          displayedScore1 <= 0
                        }
                        onClick={() =>
                          handleDisplayedScoreDelta(1, -1)
                        }
                        aria-label={`Decrease ${displayedPlayer1?.name ?? "TBD"} score`}
                      >
                        -
                      </button>
                      <span className="score-stepper-label">Score</span>
                      <button
                        className="stepper-button primary"
                        disabled={currentMatch.status === "idle"}
                        onClick={() =>
                          handleDisplayedScoreDelta(1, 1)
                        }
                        aria-label={`Increase ${displayedPlayer1?.name ?? "TBD"} score`}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="versus-divider">
                    <span>VS</span>
                    <button
                      className="inline-swap-button"
                      type="button"
                      onClick={handleSwapPlayers}
                      aria-label="Swap player sides"
                      title="Swap player sides"
                    >
                      Swap
                    </button>
                  </div>

                  <div
                    className={`player-score ${
                      displayedScore2 > displayedScore1
                        ? "is-leading"
                        : ""
                    }`}
                  >
                    <span>{displayedPlayer2?.name ?? "TBD"}</span>
                    <strong>{displayedScore2}</strong>

                    <div className="score-stepper">
                      <button
                        className="stepper-button"
                        disabled={
                          currentMatch.status === "idle" ||
                          displayedScore2 <= 0
                        }
                        onClick={() =>
                          handleDisplayedScoreDelta(2, -1)
                        }
                        aria-label={`Decrease ${displayedPlayer2?.name ?? "TBD"} score`}
                      >
                        -
                      </button>
                      <span className="score-stepper-label">Score</span>
                      <button
                        className="stepper-button primary"
                        disabled={currentMatch.status === "idle"}
                        onClick={() =>
                          handleDisplayedScoreDelta(2, 1)
                        }
                        aria-label={`Increase ${displayedPlayer2?.name ?? "TBD"} score`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <p className="round-summary">
                  Status: {getStatusLabel(currentMatch.status)}
                </p>
              </article>

              {currentDraft &&
              displayedDraftTeam1 &&
              displayedDraftTeam2 ? (
                <section className="draft-manager-card">
                  <div className="draft-manager-header">
                    <div>
                      <p className="eyebrow">Character draft</p>
                      <h3>{getDraftPhaseLabel(currentDraft.phase)}</h3>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={openDraftController}
                    >
                      Open Draft Controller
                    </button>
                  </div>
                  <div className="draft-manager-teams">
                    <DraftTeamControls
                      label={displayedPlayer1?.name ?? "Player 1"}
                      team={displayedDraftTeam1.team}
                      picks={displayedDraftTeam1.picks}
                      defeated={displayedDraftTeam1.defeated}
                      draft={currentDraft}
                      canToggle={currentDraft.phase === "complete"}
                      onToggle={handleToggleDraftCharacter}
                    />
                    <DraftTeamControls
                      label={displayedPlayer2?.name ?? "Player 2"}
                      team={displayedDraftTeam2.team}
                      picks={displayedDraftTeam2.picks}
                      defeated={displayedDraftTeam2.defeated}
                      draft={currentDraft}
                      canToggle={currentDraft.phase === "complete"}
                      onToggle={handleToggleDraftCharacter}
                    />
                  </div>
                  <p className="draft-manager-help">
                    {currentDraft.phase === "complete"
                      ? "Click a character to toggle defeated. The opposing score updates automatically."
                      : "Drafted characters will appear here and on the scoreboard as they are locked in."}
                  </p>
                </section>
              ) : (
                <button
                  className="button secondary draft-launch-button"
                  type="button"
                  onClick={() => handleStartCharacterDraft(currentMatch)}
                >
                  {draft && draft.phase !== "idle"
                    ? "Replace Active Character Draft"
                    : "Start Character Draft"}
                </button>
              )}

              {mode === "offline" ? (
                <div className="action-row">
                  <button
                    className="button secondary span-2"
                    disabled={
                      currentMatch.score1 === 0 && currentMatch.score2 === 0
                    }
                    onClick={handleResetScore}
                  >
                    Reset Scores
                  </button>
                </div>
              ) : (
                <div className="action-row">
                  <button
                    className="button"
                    disabled={currentMatch.status !== "idle"}
                    onClick={() => handleStartMatch(currentMatch)}
                  >
                    Start Match
                  </button>

                  <button
                    className="button secondary"
                    disabled={currentMatch.status === "idle"}
                    onClick={() => handleSaveMatch(currentMatch)}
                  >
                    Save Result
                  </button>

                  <button
                    className="button danger span-2"
                    disabled={
                      currentMatch.status === "idle" ||
                      currentMatch.score1 === currentMatch.score2
                    }
                    onClick={() => handleSubmitMatch(currentMatch)}
                  >
                    Submit Final Result
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        </div>
      </main>
      <button
        className="button ghost persistent-settings-button"
        type="button"
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </button>
      {settingsOpen && (
        <SettingsPane
          settings={scoreboardSettings}
          defaults={scoreboardDefaults}
          hasSavedToken={hasSavedToken}
          savingApiKey={savingApiKey}
          autoSaveState={settingsSaveState}
          onClose={() => setSettingsOpen(false)}
          onSettingsChange={handleScoreboardSettingsChange}
          onSaveApiKey={handleSaveApiKey}
        />
      )}
    </>
  );
}
