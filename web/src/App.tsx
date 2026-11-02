import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  assignMatch,
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
  showScoreboard,
  startMatch,
  submitFinalResult,
  swapScoreboardPlayers,
  unassignMatch,
  updateOfflineMatch,
  updateScore,
} from "./api";
import SettingsPane from "./SettingsPane";
import type { ScoreboardSettings } from "./scoreboardSettings";
import type { Match, TournamentStream } from "./types";

type AppMode = "startgg" | "offline";
type SetupView = "choice" | AppMode;
type ScoreboardDisplay = Record<
  string,
  { visible: boolean; swapped: boolean }
>;
type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type ServerAppState = {
  mode: AppMode | null;
  matchesData: Record<string, Match>;
  streamsData: TournamentStream[];
};

function getStatusLabel(status: Match["status"]) {
  const labels: Record<Match["status"], string> = {
    idle: "Queued",
    assigned: "Assigned",
    live: "Live",
    saved: "Saved",
    complete: "Complete",
  };

  return labels[status];
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
  const [player2Input, setPlayer2Input] = useState("");
  const [matchLabelInput, setMatchLabelInput] = useState("Offline Match");
  const [scoreboardUrl, setScoreboardUrl] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [activeStreamId, setActiveStreamId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [scoreboardDisplay, setScoreboardDisplay] =
    useState<ScoreboardDisplay>({});
  const [scoreboardSettings, setScoreboardSettings] =
    useState<ScoreboardSettings | null>(null);
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
  const settingsOpenRef = useRef(false);

  const currentMatch =
    mode === "offline"
      ? matches["offline-match"] ?? null
      : activeStreamId
        ? Object.values(matches).find(
            (match) => match.streamId === activeStreamId,
          ) ?? null
        : null;

  const scoreboardDisplayKey =
    mode === "startgg" && activeStreamId ? activeStreamId : "default";
  const displaySettings =
    scoreboardDisplay[scoreboardDisplayKey] ?? scoreboardDisplay.default;
  const playersSwapped = displaySettings?.swapped ?? false;
  const scoreboardVisible = displaySettings?.visible ?? true;
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

  const availableMatches = Object.values(matches).filter(
    (match) =>
      match &&
      match.player1 &&
      match.player2 &&
      !match.streamId &&
      match.status !== "complete",
  );

  const selectedStreamName =
    streams.find((stream) => stream.id === activeStreamId)?.name ||
    "Stream Control";

  const loadingStateComponent = (text: string) => (
    <div className="busy-overlay">
      <div className="busy-card">
        <span className="busy-spinner" />
        <span>{text}</span>
      </div>
    </div>
  );

  const emptyStreamControlMatchComponent = (
    title = "No match assigned",
    description = "Assign a set from the queue to begin controlling this stream.",
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
    setActiveStreamId((previousStreamId) => {
      if (nextStreams.some((stream) => stream.id === previousStreamId)) {
        return previousStreamId;
      }

      const assignedMatch = Object.values(nextMatches).find(
        (match) => match.streamId,
      );
      return assignedMatch?.streamId ?? nextStreams[0]?.id ?? "";
    });

    if (state.mode === "offline" && offlineMatch) {
      setPlayer1Input(offlineMatch.player1.name);
      setPlayer2Input(offlineMatch.player2.name);
      setMatchLabelInput(offlineMatch.round || "Offline Match");
      setMode("offline");
      return;
    }

    setMode(state.mode);
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

        const matchesArray = Object.values(nextMatches) as Match[];
        const matchForSelectedStream =
          matchesArray.find((match) => match.streamId) ?? null;

        setActiveStreamId((previousStreamId) => {
          const previousStreamStillExists = nextStreams.some(
            (stream) => stream.id === previousStreamId,
          );

          return previousStreamStillExists
            ? previousStreamId
            : matchForSelectedStream?.streamId || nextStreams[0]?.id || "";
        });
      }
    } catch (error) {
      console.error("Error refreshing start.gg data:", error);
      alert("Failed to load this start.gg tournament.");
    } finally {
      setIsBusy(false);
    }
  };

  const unassignStreamMatch = async () => {
    if (!currentMatch) return;

    setIsBusy(true);

    try {
      const updatedMatch = await unassignMatch(currentMatch.id);
      setMatches((previousMatches) => ({
        ...previousMatches,
        [updatedMatch.id]: updatedMatch,
      }));
    } catch (error) {
      console.error("Error unassigning stream match:", error);
      alert("Failed to unassign the stream match.");
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
        player2Input,
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
      setActiveStreamId(nextStreams[0]?.id ?? "");
      setPlayer1Input(offlineMatch.player1.name);
      setPlayer2Input(offlineMatch.player2.name);
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

  const handleScoreUpdate = async (score1: number, score2: number) => {
    if (!currentMatch) return;

    try {
      const updatedMatch = await updateScore(currentMatch.id, score1, score2);
      setMatches((previousMatches) => ({
        ...previousMatches,
        [updatedMatch.id]: updatedMatch,
      }));
      setPlayer1Input(updatedMatch.player1.name);
      setPlayer2Input(updatedMatch.player2.name);
      setMatchLabelInput(updatedMatch.round);
    } catch (error) {
      console.error("Failed to update score:", error);
      alert("Failed to update the score.");
    }
  };

  const handleDisplayedScoreUpdate = async (
    score1: number,
    score2: number,
  ) => {
    await handleScoreUpdate(
      playersSwapped ? score2 : score1,
      playersSwapped ? score1 : score2,
    );
  };

  const handleUpdateOfflineMatch = async () => {
    setIsBusy(true);

    try {
      const updatedMatch = await updateOfflineMatch(
        player1Input,
        player2Input,
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

  async function persistLatestScoreboardSettings() {
    if (settingsSaveInFlightRef.current) return;

    const settingsToSave = latestScoreboardSettingsRef.current;
    if (!settingsToSave) return;

    settingsSaveInFlightRef.current = true;
    setSettingsSaveState("saving");

    try {
      const result = await saveScoreboardSettings(settingsToSave);

      if (latestScoreboardSettingsRef.current === settingsToSave) {
        setScoreboardSettings(result.scoreboard);
        setSettingsSaveState("saved");
      }
    } catch (error) {
      console.error("Failed to apply scoreboard settings:", error);
      setSettingsSaveState("error");
      alert("Failed to apply the scoreboard settings.");
    } finally {
      settingsSaveInFlightRef.current = false;

      if (latestScoreboardSettingsRef.current !== settingsToSave) {
        void persistLatestScoreboardSettings();
      }
    }
  }

  const handleScoreboardSettingsChange = (
    nextSettings: ScoreboardSettings,
    debounce: boolean,
  ) => {
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
      await swapScoreboardPlayers(
        scoreboardDisplayKey === "default" ? undefined : scoreboardDisplayKey,
      );
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
        await hideScoreboard(
          scoreboardDisplayKey === "default" ? undefined : scoreboardDisplayKey,
        );
      } else {
        await showScoreboard(
          scoreboardDisplayKey === "default" ? undefined : scoreboardDisplayKey,
        );
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
        setScoreboardSettings(config.scoreboard);
        setScoreboardDefaults(config.scoreboardDefaults);
        setScoreboardUrl(config.urls?.scoreboard ?? "");
        latestScoreboardSettingsRef.current = config.scoreboard;
        applyServerAppState(appState);
      })
      .catch((error) => {
        console.error("Failed to load application configuration:", error);
        setHasSavedToken(false);
        setConfigLoadFailed(true);
      });
  }, [applyServerAppState]);

  useEffect(() => {
    const socket = io();

    socket.on("app:state", applyServerAppState);
    socket.on("match:update", (updatedMatches: Record<string, Match>) => {
      setMatches(updatedMatches);
    });
    socket.on("scoreboard:display", (display: ScoreboardDisplay) => {
      setScoreboardDisplay(display);
    });
    socket.on("scoreboard:settings", (settings: ScoreboardSettings) => {
      if (
        !settingsOpenRef.current &&
        !settingsSaveInFlightRef.current &&
        settingsSaveTimerRef.current === null
      ) {
        latestScoreboardSettingsRef.current = settings;
        setScoreboardSettings(settings);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [applyServerAppState]);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

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
            <div className="setup-toolbar">
              <button
                className="button ghost"
                type="button"
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
            </div>
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
                  <span>Load bracket matches, streams, and result tools.</span>
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

              <label className="field-label" htmlFor="player-one">
                Player 1
              </label>
              <input
                id="player-one"
                type="text"
                value={player1Input}
                onChange={(event) => setPlayer1Input(event.target.value)}
                placeholder="Player 1 name"
                autoFocus
              />

              <label className="field-label" htmlFor="player-two">
                Player 2
              </label>
              <input
                id="player-two"
                type="text"
                value={player2Input}
                onChange={(event) => setPlayer2Input(event.target.value)}
                placeholder="Player 2 name"
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
              : "Stream Control Dashboard"}
          </h1>
          <p className="hero-copy">
            {mode === "offline"
              ? "Control the live scoreboard without a start.gg tournament."
              : "Assign bracket matches, update scores, and report results."}
          </p>
        </div>
        <div className="hero-actions">
          <button
            className="button ghost"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
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
                Choose Stream
              </label>
              <select
                id="stream-select"
                value={activeStreamId}
                onChange={(event) => setActiveStreamId(event.target.value)}
              >
                {streams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.name}
                  </option>
                ))}
              </select>

              <div className="queue-list">
                {availableMatches.length === 0 &&
                  emptyStreamControlMatchComponent(
                    "No other matches available",
                    "Refresh start.gg or wait for both entrants to be known.",
                  )}

                {availableMatches.map((match) => (
                  <article className="match-card" key={match.id}>
                    <div className="match-card-main">
                      <div>
                        <span className={`pill pill-${match.status}`}>
                          {getStatusLabel(match.status)}
                        </span>
                        <h3>
                          {match.player1?.name ?? "TBD"}{" "}
                          <span className="muted-text">vs</span>{" "}
                          {match.player2?.name ?? "TBD"}
                        </h3>
                        <p>{match.round}</p>
                      </div>
                    </div>

                    <button
                      className="button"
                      disabled={!activeStreamId}
                      onClick={async () => {
                        setIsBusy(true);

                        try {
                          const updatedMatch = await assignMatch(
                            match.id,
                            activeStreamId,
                          );
                          setMatches((previousMatches) => {
                            const nextMatches = { ...previousMatches };

                            for (const previousMatch of Object.values(
                              nextMatches,
                            )) {
                              if (
                                previousMatch.id !== updatedMatch.id &&
                                previousMatch.streamId === activeStreamId
                              ) {
                                nextMatches[previousMatch.id] = {
                                  ...previousMatch,
                                  streamId: null,
                                  status:
                                    previousMatch.status === "assigned"
                                      ? "idle"
                                      : previousMatch.status,
                                };
                              }
                            }

                            nextMatches[updatedMatch.id] = updatedMatch;
                            return nextMatches;
                          });
                        } catch (error) {
                          console.error("Error assigning stream match:", error);
                          alert("Failed to assign the stream match.");
                        } finally {
                          setIsBusy(false);
                        }
                      }}
                    >
                      Show on Stream
                    </button>
                  </article>
                ))}
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
                <label className="field-label" htmlFor="active-player-one">
                  Player 1
                </label>
                <input
                  id="active-player-one"
                  type="text"
                  value={playersSwapped ? player2Input : player1Input}
                  onChange={(event) =>
                    playersSwapped
                      ? setPlayer2Input(event.target.value)
                      : setPlayer1Input(event.target.value)
                  }
                />

                <label className="field-label" htmlFor="active-player-two">
                  Player 2
                </label>
                <input
                  id="active-player-two"
                  type="text"
                  value={playersSwapped ? player1Input : player2Input}
                  onChange={(event) =>
                    playersSwapped
                      ? setPlayer1Input(event.target.value)
                      : setPlayer2Input(event.target.value)
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
              <p className="eyebrow">{selectedStreamName}</p>
              <h2>Stream Control</h2>
            </div>
            <div className="panel-header-actions">
              <button
                className="button secondary"
                disabled={!currentMatch}
                onClick={handleSwapPlayers}
              >
                Swap Player Sides
              </button>
              <button
                className={`button ${scoreboardVisible ? "ghost" : "danger"}`}
                disabled={!currentMatch}
                onClick={handleScoreboardVisibility}
              >
                {scoreboardVisible
                  ? "Hide Scoreboard"
                  : "Scoreboard Hidden - Show"}
              </button>
              {mode === "startgg" && (
                <button
                  className="button ghost"
                  disabled={!currentMatch}
                  onClick={unassignStreamMatch}
                >
                  Clear Scoreboard
                </button>
              )}
            </div>
          </div>

          {!currentMatch && emptyStreamControlMatchComponent()}

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
                          currentMatch.status === "assigned" ||
                          displayedScore1 <= 0
                        }
                        onClick={() =>
                          handleDisplayedScoreUpdate(
                            displayedScore1 - 1,
                            displayedScore2,
                          )
                        }
                        aria-label={`Decrease ${displayedPlayer1?.name ?? "TBD"} score`}
                      >
                        -
                      </button>
                      <span className="score-stepper-label">Score</span>
                      <button
                        className="stepper-button primary"
                        disabled={currentMatch.status === "assigned"}
                        onClick={() =>
                          handleDisplayedScoreUpdate(
                            displayedScore1 + 1,
                            displayedScore2,
                          )
                        }
                        aria-label={`Increase ${displayedPlayer1?.name ?? "TBD"} score`}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="versus-divider">VS</div>

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
                          currentMatch.status === "assigned" ||
                          displayedScore2 <= 0
                        }
                        onClick={() =>
                          handleDisplayedScoreUpdate(
                            displayedScore1,
                            displayedScore2 - 1,
                          )
                        }
                        aria-label={`Decrease ${displayedPlayer2?.name ?? "TBD"} score`}
                      >
                        -
                      </button>
                      <span className="score-stepper-label">Score</span>
                      <button
                        className="stepper-button primary"
                        disabled={currentMatch.status === "assigned"}
                        onClick={() =>
                          handleDisplayedScoreUpdate(
                            displayedScore1,
                            displayedScore2 + 1,
                          )
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
                    disabled={currentMatch.status !== "assigned"}
                    onClick={async () => {
                      setIsBusy(true);

                      try {
                        const updatedMatch = await startMatch(currentMatch.id);
                        setMatches((previousMatches) => ({
                          ...previousMatches,
                          [updatedMatch.id]: updatedMatch,
                        }));
                      } catch (error) {
                        console.error("Error starting stream match:", error);
                        alert("Failed to start the stream match.");
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                  >
                    Start Match
                  </button>

                  <button
                    className="button secondary"
                    disabled={currentMatch.status === "assigned"}
                    onClick={async () => {
                      setIsBusy(true);

                      try {
                        const updatedMatch = await saveResult(currentMatch.id);
                        setMatches((previousMatches) => ({
                          ...previousMatches,
                          [updatedMatch.id]: updatedMatch,
                        }));
                      } catch (error) {
                        console.error(
                          "Error saving stream match result:",
                          error,
                        );
                        alert("Failed to save the stream match result.");
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                  >
                    Save Result
                  </button>

                  <button
                    className="button danger span-2"
                    disabled={
                      currentMatch.status === "assigned" ||
                      currentMatch.score1 === currentMatch.score2
                    }
                    onClick={async () => {
                      const confirmed = window.confirm(
                        "Submit this final result to start.gg?",
                      );

                      if (!confirmed) return;
                      setIsBusy(true);

                      try {
                        const updatedMatch = await submitFinalResult(
                          currentMatch.id,
                        );
                        setMatches((previousMatches) => ({
                          ...previousMatches,
                          [updatedMatch.id]: updatedMatch,
                        }));
                        await refreshFromStartGG();
                      } catch (error) {
                        console.error(
                          "Error submitting stream match result:",
                          error,
                        );
                        alert("Failed to submit the stream match result.");
                      } finally {
                        setIsBusy(false);
                      }
                    }}
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
