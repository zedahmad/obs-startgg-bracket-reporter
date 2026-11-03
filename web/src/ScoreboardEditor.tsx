import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { io } from "socket.io-client";
import "../../api/public/scoreboard/scoreboard.css";
import { getConfig, saveScoreboardSettings } from "./api";
import ScoreboardCanvas from "./ScoreboardCanvas";
import SettingsPane from "./SettingsPane";
import {
  getSettingsChanges,
  mergeSettingsChanges,
  type SettingsChanges,
} from "./settingsChanges";
import { applyPlayerCardSymmetry } from "./scoreboardSymmetry";
import type {
  CharacterRailSettings,
  PlayerBlockSettings,
  RoundBlockSettings,
  ScoreboardSettings,
} from "./scoreboardSettings";

type ElementKey =
  | "player1"
  | "player2"
  | "player1Characters"
  | "player2Characters"
  | "round";
type InteractionType = "move" | "resize";
type SaveState = "idle" | "saving" | "saved" | "error";
const CANVAS_GUTTER = 24;

type Interaction = {
  pointerId: number;
  type: InteractionType;
  element: ElementKey;
  scale: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  baseSettings: ScoreboardSettings;
  latestSettings: ScoreboardSettings;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function elementSettings(
  settings: ScoreboardSettings,
  element: ElementKey,
) {
  return settings.elements[element];
}

function updateElement(
  settings: ScoreboardSettings,
  element: ElementKey,
  nextElement:
    | PlayerBlockSettings
    | CharacterRailSettings
    | RoundBlockSettings,
) {
  return {
    ...settings,
    elements: {
      ...settings.elements,
      [element]: nextElement,
    },
  };
}

export default function ScoreboardEditor() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const latestSettingsRef = useRef<ScoreboardSettings | null>(null);
  const serverSettingsRef = useRef<ScoreboardSettings | null>(null);
  const revisionRef = useRef(-1);
  const pendingChangesRef = useRef<SettingsChanges>({});
  const inFlightChangesRef = useRef<SettingsChanges>({});
  const saveInFlightRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const [settings, setSettings] = useState<ScoreboardSettings | null>(null);
  const [defaults, setDefaults] = useState<ScoreboardSettings | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({
    width: 0,
    height: 0,
  });
  const [selectedElement, setSelectedElement] =
    useState<ElementKey | null>("player1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState(false);
  const editorReady = settings !== null && defaults !== null;

  const applySnapshot = useCallback(
    (serverSettings: ScoreboardSettings, revision: number) => {
      if (revision < revisionRef.current) return;
      revisionRef.current = revision;
      serverSettingsRef.current = serverSettings;
      const interaction = interactionRef.current;
      const interactionChanges = interaction
        ? getSettingsChanges(
            interaction.baseSettings,
            interaction.latestSettings,
          )
        : {};
      const next = mergeSettingsChanges(
        mergeSettingsChanges(
          mergeSettingsChanges(serverSettings, inFlightChangesRef.current),
          pendingChangesRef.current,
        ),
        interactionChanges,
      );
      latestSettingsRef.current = next;
      setSettings(next);
    },
    [],
  );

  async function persistSettings() {
    if (saveInFlightRef.current) return;
    const changes = pendingChangesRef.current;
    if (!Object.keys(changes).length) return;

    pendingChangesRef.current = {};
    inFlightChangesRef.current = changes;
    saveInFlightRef.current = true;
    setSaveState("saving");
    let saved = false;
    let retryNewerChanges = false;

    try {
      const result = await saveScoreboardSettings(changes);
      applySnapshot(result.scoreboard, result.scoreboardRevision);
      saved = true;
      setSaveState("saved");
    } catch (error) {
      retryNewerChanges =
        Object.keys(pendingChangesRef.current).length > 0;
      pendingChangesRef.current = mergeSettingsChanges(
        changes,
        pendingChangesRef.current,
      );
      console.error("Failed to apply scoreboard settings:", error);
      setSaveState("error");
      alert("Failed to apply the scoreboard settings.");
    } finally {
      saveInFlightRef.current = false;
      inFlightChangesRef.current = {};
      if (serverSettingsRef.current) {
        applySnapshot(serverSettingsRef.current, revisionRef.current);
      }
      if (
        (saved || retryNewerChanges) &&
        Object.keys(pendingChangesRef.current).length
      ) {
        void persistSettings();
      }
    }
  }

  const queueChanges = (changes: SettingsChanges, debounce: boolean) => {
    pendingChangesRef.current = mergeSettingsChanges(
      pendingChangesRef.current,
      changes,
    );
    if (!Object.keys(pendingChangesRef.current).length) return;
    setSaveState("saving");

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (debounce) {
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistSettings();
      }, 350);
    } else {
      saveTimerRef.current = null;
      void persistSettings();
    }
  };

  const handleSettingsChange = (
    nextSettings: ScoreboardSettings,
    debounce: boolean,
  ) => {
    const previous = latestSettingsRef.current;
    if (!previous) return;
    latestSettingsRef.current = nextSettings;
    setSettings(nextSettings);
    queueChanges(getSettingsChanges(previous, nextSettings), debounce);
  };

  useEffect(() => {
    getConfig()
      .then((config) => {
        setDefaults(config.scoreboardDefaults);
        applySnapshot(config.scoreboard, config.scoreboardRevision);
      })
      .catch((error) => {
        console.error("Failed to load scoreboard editor:", error);
        setLoadError(true);
      });

    const socket = io();
    socket.on("connect", () => {
      revisionRef.current = -1;
    });
    socket.on("scoreboard:settings", applySnapshot);
    return () => {
      socket.disconnect();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [applySnapshot]);

  useLayoutEffect(() => {
    if (!editorReady) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const updateSize = () =>
      setWorkspaceSize({
        width: workspace.clientWidth,
        height: workspace.clientHeight,
      });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [editorReady]);

  if (loadError) {
    return (
      <main className="scoreboard-editor-error">
        The scoreboard editor could not load its configuration.
      </main>
    );
  }
  if (!settings || !defaults) {
    return <main className="scoreboard-editor-loading">Loading editor...</main>;
  }

  const { canvas } = settings;
  const activeElement: ElementKey | null =
    settings.layout.mirrorPlayerCards
      ? selectedElement === "player2"
        ? "player1"
        : selectedElement === "player2Characters"
          ? "player1Characters"
          : selectedElement
      : selectedElement;
  const selectedValue = activeElement
    ? elementSettings(settings, activeElement)
    : null;
  const scale =
    workspaceSize.width > 0 && workspaceSize.height > 0
      ? Math.min(
          1,
          Math.max(0, workspaceSize.width - CANVAS_GUTTER * 2) /
            canvas.width,
          Math.max(0, workspaceSize.height - CANVAS_GUTTER * 2) /
            canvas.height,
        )
      : 0;

  const beginInteraction = (
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
    element: ElementKey,
    type: InteractionType,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedElement(element);
    const current = elementSettings(settings, element);
    interactionRef.current = {
      pointerId: event.pointerId,
      type,
      element,
      scale,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: current.x,
      startY: current.y,
      startWidth: current.width,
      startHeight: current.height,
      baseSettings: settings,
      latestSettings: settings,
    };
  };

  const updateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      interaction.scale <= 0
    ) {
      return;
    }

    const deltaX =
      (event.clientX - interaction.startClientX) / interaction.scale;
    const deltaY =
      (event.clientY - interaction.startClientY) / interaction.scale;
    const current = elementSettings(
      interaction.baseSettings,
      interaction.element,
    );
    let nextElement:
      | PlayerBlockSettings
      | CharacterRailSettings
      | RoundBlockSettings;

    if (interaction.type === "move") {
      nextElement = {
        ...current,
        x: Math.round(
          clamp(interaction.startX + deltaX, 0, canvas.width - current.width),
        ),
        y: Math.round(
          clamp(
            interaction.startY + deltaY,
            0,
            canvas.height - current.height,
          ),
        ),
      };
    } else {
      const isPlayerBlock =
        interaction.element === "player1" ||
        interaction.element === "player2";
      const minimumWidth = interaction.element === "round"
        ? 80
        : isPlayerBlock
          ? (current as PlayerBlockSettings).scoreWidth + 80
          : 72;
      nextElement = {
        ...current,
        width: Math.round(
          clamp(
            interaction.startWidth + deltaX,
            minimumWidth,
            canvas.width - current.x,
          ),
        ),
        height: Math.round(
          clamp(
            interaction.startHeight + deltaY,
            interaction.element === "round" ||
              interaction.element === "player1Characters" ||
              interaction.element === "player2Characters"
              ? 24
              : 32,
            canvas.height - current.y,
          ),
        ),
      };
    }

    const nextSettings = applyPlayerCardSymmetry(
      updateElement(
        interaction.baseSettings,
        interaction.element,
        nextElement,
      ),
    );
    interaction.latestSettings = nextSettings;
    latestSettingsRef.current = nextSettings;
    setSettings(nextSettings);
  };

  const finishInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    queueChanges(
      getSettingsChanges(
        interaction.baseSettings,
        interaction.latestSettings,
      ),
      false,
    );
  };

  const editBox = (element: ElementKey) => {
    const value = elementSettings(settings, element);
    return (
      <div
        className={`scoreboard-editor-hitbox ${
          activeElement === element ? "is-selected" : ""
        } ${value.enabled ? "" : "is-disabled"}`}
        style={{
          left: value.x,
          top: value.y,
          width: value.width,
          height: value.height,
        }}
        onPointerDown={(event) => beginInteraction(event, element, "move")}
      >
        <span className="scoreboard-editor-element-label">
          {element === "player1"
            ? "Player 1"
            : element === "player2"
              ? "Player 2"
              : element === "player1Characters"
                ? "P1 Characters"
                : element === "player2Characters"
                  ? "P2 Characters"
                  : "Round"}
        </span>
        <button
          className="scoreboard-editor-resize-handle"
          type="button"
          aria-label={`Resize ${element}`}
          onPointerDown={(event) => beginInteraction(event, element, "resize")}
        />
      </div>
    );
  };

  return (
    <main className="scoreboard-editor-page">
      <header className="scoreboard-editor-toolbar">
        <div>
          <strong>Scoreboard Editor</strong>
          <span className={`settings-save-status settings-save-${saveState}`}>
            {
              {
                idle: "Changes apply automatically",
                saving: "Applying changes...",
                saved: "Changes applied",
                error: "Could not apply changes",
              }[saveState]
            }
          </span>
          <span className="scoreboard-editor-toolbar-meta">
            Canvas {canvas.width} × {canvas.height} ·{" "}
            {Math.round(scale * 100)}%
            {activeElement && selectedValue
              ? ` · ${activeElement}: x ${selectedValue.x}, y ${selectedValue.y}, ${selectedValue.width} × ${selectedValue.height}`
              : " · No element selected"}
          </span>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => setSettingsOpen(true)}
        >
          Scoreboard Settings
        </button>
      </header>

      <div
        className="scoreboard-editor-workspace"
        ref={workspaceRef}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
      >
        <div
          className="scoreboard-editor-viewport"
          style={{
            width: canvas.width * scale,
            height: canvas.height * scale,
          }}
          aria-label={`${canvas.width} by ${canvas.height} live scoreboard canvas`}
        >
          <div
            className="scoreboard-editor-stage"
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${scale})`,
            }}
            onPointerDown={() => setSelectedElement(null)}
          >
            <ScoreboardCanvas
              settings={settings}
              className="scoreboard-editor-canvas"
            />
            {editBox("player1")}
            {!settings.layout.mirrorPlayerCards && editBox("player2")}
            {editBox("player1Characters")}
            {!settings.layout.mirrorPlayerCards &&
              editBox("player2Characters")}
            {editBox("round")}
          </div>
        </div>
      </div>

      {settingsOpen && (
        <SettingsPane
          variant="editor"
          settings={settings}
          defaults={defaults}
          hasSavedToken={false}
          savingApiKey={false}
          autoSaveState={saveState}
          onClose={() => setSettingsOpen(false)}
          onSettingsChange={handleSettingsChange}
          onSaveApiKey={async () => false}
        />
      )}
    </main>
  );
}
