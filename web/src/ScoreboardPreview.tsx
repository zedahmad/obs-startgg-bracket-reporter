import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BackgroundSettings,
  PlayerBlockSettings,
  RoundBlockSettings,
  ScoreboardSettings,
} from "./scoreboardSettings";

type ElementKey = "player1" | "player2" | "round";
type InteractionType = "move" | "resize";

type ScoreboardPreviewProps = {
  settings: ScoreboardSettings;
  onChange: (settings: ScoreboardSettings) => void;
  onCommit: (settings: ScoreboardSettings) => void;
};

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

function backgroundValue(background: BackgroundSettings) {
  return (
    background.customCss.trim() ||
    `linear-gradient(${background.angle}deg, ${background.startColor}, ${background.endColor})`
  );
}

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
  nextElement: PlayerBlockSettings | RoundBlockSettings,
) {
  return {
    ...settings,
    elements: {
      ...settings.elements,
      [element]: nextElement,
    },
  };
}

type PreviewNameProps = {
  sponsor: string;
  player: string;
  fontSize: number;
  width: number;
};

function PreviewName({
  sponsor,
  player,
  fontSize,
  width,
}: PreviewNameProps) {
  const nameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    element.style.fontSize = `${fontSize}px`;
    element.style.transform = "scaleX(1)";

    if (element.scrollWidth <= element.clientWidth) return;

    const fittedScale = Math.max(
      0.35,
      element.clientWidth / element.scrollWidth,
    );
    element.style.transform = `scaleX(${fittedScale})`;
  }, [fontSize, player, sponsor, width]);

  return (
    <div className="wysiwyg-player-name" ref={nameRef}>
      <span className="wysiwyg-sponsor">{sponsor}</span>
      <span className="wysiwyg-name-separator"> | </span>
      <span className="wysiwyg-player-tag">{player}</span>
    </div>
  );
}

export default function ScoreboardPreview({
  settings,
  onChange,
  onCommit,
}: ScoreboardPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [selectedElement, setSelectedElement] =
    useState<ElementKey>("player1");
  const { canvas, elements, text } = settings;
  const scale =
    availableWidth > 0
      ? Math.min(1, availableWidth / canvas.width, 420 / canvas.height)
      : 0;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setAvailableWidth(container.clientWidth);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const beginInteraction = (
    event: ReactPointerEvent<HTMLElement>,
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
    let nextElement: PlayerBlockSettings | RoundBlockSettings;

    if (interaction.type === "move") {
      nextElement = {
        ...current,
        x: Math.round(
          clamp(
            interaction.startX + deltaX,
            0,
            canvas.width - current.width,
          ),
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
      const minimumWidth =
        interaction.element === "round"
          ? 80
          : (current as PlayerBlockSettings).scoreWidth + 80;
      const minimumHeight = interaction.element === "round" ? 24 : 32;

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
            minimumHeight,
            canvas.height - current.y,
          ),
        ),
      };
    }

    const nextSettings = updateElement(
      interaction.baseSettings,
      interaction.element,
      nextElement,
    );
    interaction.latestSettings = nextSettings;
    onChange(nextSettings);
  };

  const finishInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    interactionRef.current = null;
    onCommit(interaction.latestSettings);
  };

  const playerBlock = (
    element: "player1" | "player2",
    sponsor: string,
    player: string,
    score: number,
  ) => {
    const value = elements[element];
    const isPlayer1 = element === "player1";
    const namePanel = (
      <div
        className={`wysiwyg-name-panel ${isPlayer1 ? "p1" : "p2"}`}
        style={{
          width: value.width - value.scoreWidth,
          background: backgroundValue(value.nameBackground),
        }}
      >
        <PreviewName
          sponsor={sponsor}
          player={player}
          fontSize={text.playerNameSize}
          width={value.width - value.scoreWidth}
        />
      </div>
    );
    const scoreBox = (
      <div
        className="wysiwyg-score-box"
        style={{
          width: value.scoreWidth,
          background: backgroundValue(value.scoreBackground),
          color: text.scoreColor,
          fontSize: text.scoreSize,
        }}
      >
        {score}
      </div>
    );

    return (
      <div
        className={`wysiwyg-element wysiwyg-player-block ${
          selectedElement === element ? "is-selected" : ""
        } ${value.enabled ? "" : "is-disabled"}`}
        style={{
          left: value.x,
          top: value.y,
          width: value.width,
          height: value.height,
          color: text.playerNameColor,
        }}
        onPointerDown={(event) => beginInteraction(event, element, "move")}
      >
        {isPlayer1 ? (
          <>
            {namePanel}
            {scoreBox}
          </>
        ) : (
          <>
            {scoreBox}
            {namePanel}
          </>
        )}
        {!value.enabled && (
          <span className="wysiwyg-disabled-label">Disabled</span>
        )}
        <button
          className="wysiwyg-resize-handle"
          type="button"
          aria-label={`Resize ${isPlayer1 ? "player 1" : "player 2"} element`}
          onPointerDown={(event) => beginInteraction(event, element, "resize")}
        />
      </div>
    );
  };

  return (
    <section className="settings-section wysiwyg-section">
      <div>
        <p className="eyebrow">Visual editor</p>
        <h3>Scoreboard preview</h3>
        <p className="wysiwyg-help">
          Drag elements to move them. Use the lower-right handles to resize.
        </p>
      </div>
      <div className="wysiwyg-preview-container" ref={containerRef}>
        <div
          className="wysiwyg-preview-viewport"
          style={{
            width: canvas.width * scale,
            height: canvas.height * scale,
          }}
        >
          <div
            className="wysiwyg-preview-stage"
            style={{
              width: canvas.width,
              height: canvas.height,
              fontFamily: text.fontFamily,
              transform: `scale(${scale})`,
            }}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
          >
            {playerBlock("player1", "SPONSOR", "PLAYER ONE", 2)}
            {playerBlock("player2", "SPONSOR", "PLAYER TWO", 1)}
            <div
              className={`wysiwyg-element wysiwyg-round ${
                selectedElement === "round" ? "is-selected" : ""
              } ${elements.round.enabled ? "" : "is-disabled"}`}
              style={{
                left: elements.round.x,
                top: elements.round.y,
                width: elements.round.width,
                height: elements.round.height,
                color: text.roundColor,
                fontSize: text.roundSize,
                background: backgroundValue(elements.round.background),
              }}
              onPointerDown={(event) =>
                beginInteraction(event, "round", "move")
              }
            >
              WINNERS FINAL
              {!elements.round.enabled && (
                <span className="wysiwyg-disabled-label">Disabled</span>
              )}
              <button
                className="wysiwyg-resize-handle"
                type="button"
                aria-label="Resize round indicator"
                onPointerDown={(event) =>
                  beginInteraction(event, "round", "resize")
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
