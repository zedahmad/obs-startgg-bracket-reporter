import type { ScoreboardSettings } from "./scoreboardSettings";

export function applyPlayerCardSymmetry(
  settings: ScoreboardSettings,
): ScoreboardSettings {
  if (!settings.layout.mirrorPlayerCards) return settings;

  const player1 = settings.elements.player1;
  return {
    ...settings,
    elements: {
      ...settings.elements,
      player2: {
        ...settings.elements.player2,
        enabled: player1.enabled,
        x: settings.canvas.width - player1.x - player1.width,
        y: player1.y,
        width: player1.width,
        height: player1.height,
        scoreWidth: player1.scoreWidth,
      },
      player2Characters: {
        ...settings.elements.player2Characters,
        enabled: settings.elements.player1Characters.enabled,
        x:
          settings.canvas.width -
          settings.elements.player1Characters.x -
          settings.elements.player1Characters.width,
        y: settings.elements.player1Characters.y,
        width: settings.elements.player1Characters.width,
        height: settings.elements.player1Characters.height,
      },
    },
  };
}
