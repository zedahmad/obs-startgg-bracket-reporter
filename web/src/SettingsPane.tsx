import { useState } from "react";
import { getSettingsChanges, mergeSettingsChanges } from "./settingsChanges";
import { applyPlayerCardSymmetry } from "./scoreboardSymmetry";
import type {
  BackgroundSettings,
  PlayerBlockSettings,
  ScoreboardSettings,
} from "./scoreboardSettings";

type AutoSaveState = "idle" | "saving" | "saved" | "error";

type SettingsPaneProps = {
  variant?: "application" | "editor";
  settings: ScoreboardSettings;
  defaults: ScoreboardSettings;
  hasSavedToken: boolean;
  savingApiKey: boolean;
  autoSaveState: AutoSaveState;
  onClose: () => void;
  onSettingsChange: (
    settings: ScoreboardSettings,
    debounce: boolean,
  ) => void;
  onSaveApiKey: (apiToken: string) => Promise<boolean>;
};

type NumberFieldProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function NumberField({
  id,
  label,
  value,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="settings-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        value={value}
        required
        onChange={(event) => {
          if (Number.isFinite(event.target.valueAsNumber)) {
            onChange(event.target.valueAsNumber);
          }
        }}
      />
    </label>
  );
}

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  onRestore: () => void;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
};

function SectionHeading({
  eyebrow,
  title,
  onRestore,
  enabled,
  onEnabledChange,
}: SectionHeadingProps) {
  return (
    <div className="settings-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      <div className="settings-section-actions">
        {enabled !== undefined && onEnabledChange && (
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
            <span>{enabled ? "Enabled" : "Disabled"}</span>
          </label>
        )}
        <button
          className="button ghost settings-reset"
          type="button"
          onClick={onRestore}
        >
          Restore Defaults
        </button>
      </div>
    </div>
  );
}

type BackgroundEditorProps = {
  idPrefix: string;
  title: string;
  value: BackgroundSettings;
  onChange: (
    value: BackgroundSettings,
    options?: { debounce?: boolean; apply?: boolean },
  ) => void;
};

function BackgroundEditor({
  idPrefix,
  title,
  value,
  onChange,
}: BackgroundEditorProps) {
  const customCssValid =
    !value.customCss.trim() ||
    CSS.supports("background", value.customCss);

  return (
    <fieldset className="settings-subsection">
      <legend>{title}</legend>
      <div className="settings-grid settings-grid-3">
        <label className="settings-field" htmlFor={`${idPrefix}-start`}>
          <span>Start color</span>
          <input
            id={`${idPrefix}-start`}
            type="color"
            value={value.startColor}
            required
            onChange={(event) =>
              onChange({ ...value, startColor: event.target.value })
            }
          />
        </label>
        <label className="settings-field" htmlFor={`${idPrefix}-end`}>
          <span>End color</span>
          <input
            id={`${idPrefix}-end`}
            type="color"
            value={value.endColor}
            required
            onChange={(event) =>
              onChange({ ...value, endColor: event.target.value })
            }
          />
        </label>
        <NumberField
          id={`${idPrefix}-angle`}
          label="Angle"
          value={value.angle}
          onChange={(angle) => onChange({ ...value, angle })}
        />
      </div>
      <label className="settings-field" htmlFor={`${idPrefix}-custom`}>
        <span>Raw CSS background override (optional)</span>
        <input
          id={`${idPrefix}-custom`}
          type="text"
          value={value.customCss}
          aria-invalid={!customCssValid}
          placeholder="e.g. linear-gradient(90deg, #111 0%, #555 100%)"
          onChange={(event) => {
            const customCss = event.target.value;
            onChange(
              { ...value, customCss },
              {
                debounce: true,
                apply:
                  !customCss.trim() ||
                  CSS.supports("background", customCss),
              },
            );
          }}
        />
        {!customCssValid && (
          <small className="settings-field-error">
            Enter a valid CSS background value before it is applied.
          </small>
        )}
      </label>
    </fieldset>
  );
}

type PlayerBlockEditorProps = {
  idPrefix: string;
  title: string;
  value: PlayerBlockSettings;
  defaultValue: PlayerBlockSettings;
  onChange: (
    value: PlayerBlockSettings,
    options?: { debounce?: boolean; apply?: boolean },
  ) => void;
};

function PlayerBlockEditor({
  idPrefix,
  title,
  value,
  defaultValue,
  onChange,
}: PlayerBlockEditorProps) {
  return (
    <section className="settings-section">
      <SectionHeading
        eyebrow="Scoreboard element"
        title={title}
        enabled={value.enabled}
        onEnabledChange={(enabled) => onChange({ ...value, enabled })}
        onRestore={() => onChange(structuredClone(defaultValue))}
      />
      <div className="settings-grid settings-grid-5">
        <NumberField
          id={`${idPrefix}-x`}
          label="X"
          value={value.x}
          onChange={(x) => onChange({ ...value, x })}
        />
        <NumberField
          id={`${idPrefix}-y`}
          label="Y"
          value={value.y}
          onChange={(y) => onChange({ ...value, y })}
        />
        <NumberField
          id={`${idPrefix}-width`}
          label="Width"
          value={value.width}
          onChange={(width) => onChange({ ...value, width })}
        />
        <NumberField
          id={`${idPrefix}-height`}
          label="Height"
          value={value.height}
          onChange={(height) => onChange({ ...value, height })}
        />
        <NumberField
          id={`${idPrefix}-score-width`}
          label="Score width"
          value={value.scoreWidth}
          onChange={(scoreWidth) => onChange({ ...value, scoreWidth })}
        />
      </div>
      <BackgroundEditor
        idPrefix={`${idPrefix}-name-background`}
        title="Name panel background"
        value={value.nameBackground}
        onChange={(nameBackground, options) =>
          onChange({ ...value, nameBackground }, options)
        }
      />
      <BackgroundEditor
        idPrefix={`${idPrefix}-score-background`}
        title="Score box background"
        value={value.scoreBackground}
        onChange={(scoreBackground, options) =>
          onChange({ ...value, scoreBackground }, options)
        }
      />
    </section>
  );
}

function settingsWithValidCustomCss(
  draft: ScoreboardSettings,
  applied: ScoreboardSettings,
) {
  const next = structuredClone(draft);
  const backgrounds = [
    [
      next.elements.player1.nameBackground,
      applied.elements.player1.nameBackground,
    ],
    [
      next.elements.player1.scoreBackground,
      applied.elements.player1.scoreBackground,
    ],
    [
      next.elements.player2.nameBackground,
      applied.elements.player2.nameBackground,
    ],
    [
      next.elements.player2.scoreBackground,
      applied.elements.player2.scoreBackground,
    ],
    [next.elements.round.background, applied.elements.round.background],
  ];

  for (const [nextBackground, appliedBackground] of backgrounds) {
    if (
      nextBackground.customCss.trim() &&
      !CSS.supports("background", nextBackground.customCss)
    ) {
      nextBackground.customCss = appliedBackground.customCss;
    }
  }

  return next;
}

export default function SettingsPane({
  variant = "application",
  settings,
  defaults,
  hasSavedToken,
  savingApiKey,
  autoSaveState,
  onClose,
  onSettingsChange,
  onSaveApiKey,
}: SettingsPaneProps) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [previousSettings, setPreviousSettings] = useState(settings);
  const [apiToken, setApiToken] = useState("");
  const editorMode = variant === "editor";

  if (previousSettings !== settings) {
    setPreviousSettings(settings);
    setDraft(mergeSettingsChanges(
      settings,
      getSettingsChanges(previousSettings, draft),
    ));
  }

  const applyDraft = (
    nextDraft: ScoreboardSettings,
    options: { debounce?: boolean; apply?: boolean } = {},
  ) => {
    const normalizedDraft = applyPlayerCardSymmetry(nextDraft);
    setDraft(normalizedDraft);

    if (options.apply !== false) {
      onSettingsChange(
        settingsWithValidCustomCss(normalizedDraft, settings),
        options.debounce ?? false,
      );
    }
  };

  const autoSaveLabel = {
    idle: "Changes apply automatically",
    saving: "Applying changes...",
    saved: "Changes applied",
    error: "Could not apply changes",
  }[autoSaveState];
  return (
    <div
      className={`settings-backdrop ${
        editorMode ? "scoreboard-editor-settings-backdrop" : ""
      }`}
    >
      <aside
        className="settings-pane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-pane-layout">
          <header className="settings-header">
            <div>
              <p className="eyebrow">
                {editorMode ? "Visual editor" : "Application settings"}
              </p>
              <h2 id="settings-title">
                {editorMode ? "Scoreboard customization" : "Settings"}
              </h2>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </header>

          <div className="settings-content">
            {!editorMode && (
              <>
                <section className="settings-section">
                  <div>
                    <p className="eyebrow">Connection</p>
                    <h3>start.gg</h3>
                  </div>
                  <form
                    className="settings-api-key-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (await onSaveApiKey(apiToken)) {
                        setApiToken("");
                      }
                    }}
                  >
                    <label
                      className="settings-field"
                      htmlFor="settings-api-token"
                    >
                      <span>API key</span>
                      <input
                        id="settings-api-token"
                        type="password"
                        value={apiToken}
                        required
                        placeholder={
                          hasSavedToken
                            ? "Enter a replacement key"
                            : "start.gg API key"
                        }
                        onChange={(event) => setApiToken(event.target.value)}
                      />
                    </label>
                    <button
                      className="button"
                      type="submit"
                      disabled={savingApiKey || !apiToken.trim()}
                    >
                      {savingApiKey ? "Saving..." : "Save API Key"}
                    </button>
                  </form>
                </section>

                <section className="settings-section">
                  <div>
                    <p className="eyebrow">Scoreboard appearance</p>
                    <h3>Visual editor</h3>
                    <p className="settings-launch-copy">
                      Open the full scoreboard canvas to position elements and
                      customize its appearance.
                    </p>
                  </div>
                  <a
                    className="button settings-editor-link"
                    href="/scoreboard-editor"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Customize Scoreboard
                  </a>
                </section>
              </>
            )}

            {editorMode && (
              <>
            <section className="settings-section">
              <SectionHeading
                eyebrow="Canvas"
                title="OBS browser source dimensions"
                onRestore={() =>
                  applyDraft({
                    ...draft,
                    canvas: structuredClone(defaults.canvas),
                  })
                }
              />
              <div className="settings-grid">
                <NumberField
                  id="canvas-width"
                  label="Width"
                  value={draft.canvas.width}
                  onChange={(width) =>
                    applyDraft({
                      ...draft,
                      canvas: { ...draft.canvas, width },
                    })
                  }
                />
                <NumberField
                  id="canvas-height"
                  label="Height"
                  value={draft.canvas.height}
                  onChange={(height) =>
                    applyDraft({
                      ...draft,
                      canvas: { ...draft.canvas, height },
                    })
                  }
                />
              </div>
            </section>

            <section className="settings-section">
              <SectionHeading
                eyebrow="Typography"
                title="Scoreboard text"
                onRestore={() =>
                  applyDraft({
                    ...draft,
                    text: structuredClone(defaults.text),
                  })
                }
              />
              <label className="settings-field" htmlFor="font-family">
                <span>CSS font family</span>
                <input
                  id="font-family"
                  type="text"
                  value={draft.text.fontFamily}
                  required
                  onChange={(event) =>
                    applyDraft({
                      ...draft,
                      text: {
                        ...draft.text,
                        fontFamily: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <div className="settings-grid settings-grid-3">
                <NumberField
                  id="player-name-size"
                  label="Player name size"
                  value={draft.text.playerNameSize}
                  onChange={(playerNameSize) =>
                    applyDraft({
                      ...draft,
                      text: { ...draft.text, playerNameSize },
                    })
                  }
                />
                <NumberField
                  id="score-size"
                  label="Score size"
                  value={draft.text.scoreSize}
                  onChange={(scoreSize) =>
                    applyDraft({
                      ...draft,
                      text: { ...draft.text, scoreSize },
                    })
                  }
                />
                <NumberField
                  id="round-size"
                  label="Round size"
                  value={draft.text.roundSize}
                  onChange={(roundSize) =>
                    applyDraft({
                      ...draft,
                      text: { ...draft.text, roundSize },
                    })
                  }
                />
                <label className="settings-field" htmlFor="player-name-color">
                  <span>Player name color</span>
                  <input
                    id="player-name-color"
                    type="color"
                    value={draft.text.playerNameColor}
                    required
                    onChange={(event) =>
                      applyDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          playerNameColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="settings-field" htmlFor="score-color">
                  <span>Score color</span>
                  <input
                    id="score-color"
                    type="color"
                    value={draft.text.scoreColor}
                    required
                    onChange={(event) =>
                      applyDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          scoreColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="settings-field" htmlFor="round-color">
                  <span>Round color</span>
                  <input
                    id="round-color"
                    type="color"
                    value={draft.text.roundColor}
                    required
                    onChange={(event) =>
                      applyDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          roundColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <fieldset className="settings-subsection">
                <legend>Player metadata</legend>
                <div className="settings-section-actions">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={draft.text.sponsorTagsEnabled}
                      onChange={(event) =>
                        applyDraft({
                          ...draft,
                          text: {
                            ...draft.text,
                            sponsorTagsEnabled: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      {draft.text.sponsorTagsEnabled
                        ? "Sponsor tags enabled"
                        : "Sponsor tags disabled"}
                    </span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={draft.text.sponsorTagSeparatorEnabled}
                      onChange={(event) =>
                        applyDraft({
                          ...draft,
                          text: {
                            ...draft.text,
                            sponsorTagSeparatorEnabled: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      {draft.text.sponsorTagSeparatorEnabled
                        ? "Sponsor separator enabled"
                        : "Sponsor separator disabled"}
                    </span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={draft.text.playerFlagsEnabled}
                      onChange={(event) =>
                        applyDraft({
                          ...draft,
                          text: {
                            ...draft.text,
                            playerFlagsEnabled: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      {draft.text.playerFlagsEnabled
                        ? "Player flags enabled"
                        : "Player flags disabled"}
                    </span>
                  </label>
                </div>
                <div className="settings-grid settings-grid-3">
                  <NumberField
                    id="sponsor-tag-size"
                    label="Sponsor tag size"
                    value={draft.text.sponsorTagSize}
                    onChange={(sponsorTagSize) =>
                      applyDraft({
                        ...draft,
                        text: { ...draft.text, sponsorTagSize },
                      })
                    }
                  />
                  <NumberField
                    id="sponsor-tag-weight"
                    label="Sponsor tag weight"
                    value={draft.text.sponsorTagWeight}
                    onChange={(sponsorTagWeight) =>
                      applyDraft({
                        ...draft,
                        text: { ...draft.text, sponsorTagWeight },
                      })
                    }
                  />
                  <label className="settings-field" htmlFor="sponsor-tag-color">
                    <span>Sponsor tag color</span>
                    <input
                      id="sponsor-tag-color"
                      type="color"
                      value={draft.text.sponsorTagColor}
                      required
                      onChange={(event) =>
                        applyDraft({
                          ...draft,
                          text: {
                            ...draft.text,
                            sponsorTagColor: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label
                    className="settings-field"
                    htmlFor="sponsor-tag-separator"
                  >
                    <span>Sponsor separator</span>
                    <input
                      id="sponsor-tag-separator"
                      type="text"
                      value={draft.text.sponsorTagSeparator}
                      maxLength={20}
                      disabled={!draft.text.sponsorTagSeparatorEnabled}
                      onChange={(event) =>
                        applyDraft({
                          ...draft,
                          text: {
                            ...draft.text,
                            sponsorTagSeparator: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </fieldset>
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <div>
                  <p className="eyebrow">Player card layout</p>
                  <h3>Symmetry</h3>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={draft.layout.mirrorPlayerCards}
                    onChange={(event) =>
                      applyDraft({
                        ...draft,
                        layout: {
                          ...draft.layout,
                          mirrorPlayerCards: event.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    {draft.layout.mirrorPlayerCards
                      ? "Player cards stay symmetrical"
                      : "Player cards can be positioned independently"}
                  </span>
                </label>
              </div>
              <p className="settings-help-copy">
                When enabled, Player 2 mirrors Player 1 across the canvas while
                keeping its own background styling.
              </p>
            </section>

            <PlayerBlockEditor
              idPrefix="player-one"
              title="Player 1 name and score"
              value={draft.elements.player1}
              defaultValue={defaults.elements.player1}
              onChange={(player1, options) =>
                applyDraft(
                  {
                    ...draft,
                    elements: { ...draft.elements, player1 },
                  },
                  options,
                )
              }
            />

            {!draft.layout.mirrorPlayerCards && (
              <PlayerBlockEditor
                idPrefix="player-two"
                title="Player 2 name and score"
                value={draft.elements.player2}
                defaultValue={defaults.elements.player2}
                onChange={(player2, options) =>
                  applyDraft(
                    {
                      ...draft,
                      elements: { ...draft.elements, player2 },
                    },
                    options,
                  )
                }
              />
            )}

            <section className="settings-section">
              <SectionHeading
                eyebrow="Scoreboard element"
                title="Round indicator"
                enabled={draft.elements.round.enabled}
                onEnabledChange={(enabled) =>
                  applyDraft({
                    ...draft,
                    elements: {
                      ...draft.elements,
                      round: { ...draft.elements.round, enabled },
                    },
                  })
                }
                onRestore={() =>
                  applyDraft({
                    ...draft,
                    elements: {
                      ...draft.elements,
                      round: structuredClone(defaults.elements.round),
                    },
                  })
                }
              />
              <div className="settings-grid">
                <NumberField
                  id="round-x"
                  label="X"
                  value={draft.elements.round.x}
                  onChange={(x) =>
                    applyDraft({
                      ...draft,
                      elements: {
                        ...draft.elements,
                        round: { ...draft.elements.round, x },
                      },
                    })
                  }
                />
                <NumberField
                  id="round-y"
                  label="Y"
                  value={draft.elements.round.y}
                  onChange={(y) =>
                    applyDraft({
                      ...draft,
                      elements: {
                        ...draft.elements,
                        round: { ...draft.elements.round, y },
                      },
                    })
                  }
                />
                <NumberField
                  id="round-width"
                  label="Width"
                  value={draft.elements.round.width}
                  onChange={(width) =>
                    applyDraft({
                      ...draft,
                      elements: {
                        ...draft.elements,
                        round: { ...draft.elements.round, width },
                      },
                    })
                  }
                />
                <NumberField
                  id="round-height"
                  label="Height"
                  value={draft.elements.round.height}
                  onChange={(height) =>
                    applyDraft({
                      ...draft,
                      elements: {
                        ...draft.elements,
                        round: { ...draft.elements.round, height },
                      },
                    })
                  }
                />
              </div>
              <BackgroundEditor
                idPrefix="round-background"
                title="Round indicator background"
                value={draft.elements.round.background}
                onChange={(background, options) =>
                  applyDraft(
                    {
                      ...draft,
                      elements: {
                        ...draft.elements,
                        round: { ...draft.elements.round, background },
                      },
                    },
                    options,
                  )
                }
              />
            </section>
              </>
            )}
          </div>

          <footer className="settings-footer">
            <span
              className={`settings-save-status settings-save-${autoSaveState}`}
            >
              {editorMode
                ? autoSaveLabel
                : "Scoreboard customization opens in a separate tab"}
            </span>
            <button className="button" type="button" onClick={onClose}>
              Done
            </button>
          </footer>
        </div>
      </aside>
    </div>
  );
}
