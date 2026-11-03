export type BackgroundSettings = {
  startColor: string;
  endColor: string;
  angle: number;
  customCss: string;
};

export type PlayerBlockSettings = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scoreWidth: number;
  nameBackground: BackgroundSettings;
  scoreBackground: BackgroundSettings;
};

export type RoundBlockSettings = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  background: BackgroundSettings;
};

export type CharacterRailSettings = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScoreboardSettings = {
  canvas: {
    width: number;
    height: number;
  };
  layout: {
    mirrorPlayerCards: boolean;
  };
  text: {
    fontFamily: string;
    playerNameSize: number;
    playerNameColor: string;
    sponsorTagsEnabled: boolean;
    sponsorTagSize: number;
    sponsorTagColor: string;
    sponsorTagWeight: number;
    sponsorTagSeparator: string;
    sponsorTagSeparatorEnabled: boolean;
    playerFlagsEnabled: boolean;
    scoreSize: number;
    scoreColor: string;
    roundSize: number;
    roundColor: string;
  };
  elements: {
    player1: PlayerBlockSettings;
    player2: PlayerBlockSettings;
    player1Characters: CharacterRailSettings;
    player2Characters: CharacterRailSettings;
    round: RoundBlockSettings;
  };
};

export const DEFAULT_SCOREBOARD_SETTINGS: ScoreboardSettings = {
  canvas: {
    width: 1920,
    height: 1080,
  },
  layout: {
    mirrorPlayerCards: true,
  },
  text: {
    fontFamily: '"Barlow Condensed", sans-serif',
    playerNameSize: 30,
    playerNameColor: "#ffffff",
    sponsorTagsEnabled: true,
    sponsorTagSize: 24,
    sponsorTagColor: "#b8c7e0",
    sponsorTagWeight: 700,
    sponsorTagSeparator: "|",
    sponsorTagSeparatorEnabled: false,
    playerFlagsEnabled: false,
    scoreSize: 38,
    scoreColor: "#111111",
    roundSize: 18,
    roundColor: "#ffffff",
  },
  elements: {
    player1: {
      enabled: true,
      x: 340,
      y: 140,
      width: 368,
      height: 60,
      scoreWidth: 60,
      nameBackground: {
        startColor: "#527aa0",
        endColor: "#4f4c83",
        angle: 270,
        customCss: "",
      },
      scoreBackground: {
        startColor: "#ffffff",
        endColor: "#ffffff",
        angle: 90,
        customCss: "",
      },
    },
    player2: {
      enabled: true,
      x: 1212,
      y: 140,
      width: 368,
      height: 60,
      scoreWidth: 60,
      nameBackground: {
        startColor: "#527aa0",
        endColor: "#4f4c83",
        angle: 90,
        customCss: "",
      },
      scoreBackground: {
        startColor: "#ffffff",
        endColor: "#ffffff",
        angle: 90,
        customCss: "",
      },
    },
    player1Characters: {
      enabled: true,
      x: 340,
      y: 208,
      width: 180,
      height: 48,
    },
    player2Characters: {
      enabled: true,
      x: 1400,
      y: 208,
      width: 180,
      height: 48,
    },
    round: {
      enabled: true,
      x: 863,
      y: 158,
      width: 194,
      height: 32,
      background: {
        startColor: "#d00a69",
        endColor: "#d00a69",
        angle: 90,
        customCss: "",
      },
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string) {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value;
}

function requireNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}`);
  }

  return value;
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
}

function requireString(
  value: unknown,
  path: string,
  maximumLength: number,
  allowEmpty = false,
) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > maximumLength
  ) {
    throw new Error(
      `${path} must be ${allowEmpty ? "a" : "a non-empty"} string of at most ${maximumLength} characters`,
    );
  }

  return value;
}

function parseBackground(value: unknown, path: string): BackgroundSettings {
  const background = requireRecord(value, path);

  return {
    startColor: requireString(
      background.startColor,
      `${path}.startColor`,
      100,
    ),
    endColor: requireString(background.endColor, `${path}.endColor`, 100),
    angle: requireNumber(background.angle, `${path}.angle`, -360, 360),
    customCss: requireString(
      background.customCss,
      `${path}.customCss`,
      500,
      true,
    ),
  };
}

function parsePlayerBlock(
  value: unknown,
  path: string,
): PlayerBlockSettings {
  const block = requireRecord(value, path);
  const width = requireNumber(block.width, `${path}.width`, 1, 10000);
  const scoreWidth = requireNumber(
    block.scoreWidth,
    `${path}.scoreWidth`,
    1,
    10000,
  );

  if (scoreWidth >= width) {
    throw new Error(`${path}.scoreWidth must be smaller than ${path}.width`);
  }

  return {
    enabled: requireBoolean(block.enabled, `${path}.enabled`),
    x: requireNumber(block.x, `${path}.x`, -10000, 10000),
    y: requireNumber(block.y, `${path}.y`, -10000, 10000),
    width,
    height: requireNumber(block.height, `${path}.height`, 1, 10000),
    scoreWidth,
    nameBackground: parseBackground(
      block.nameBackground,
      `${path}.nameBackground`,
    ),
    scoreBackground: parseBackground(
      block.scoreBackground,
      `${path}.scoreBackground`,
    ),
  };
}

function parseCharacterRail(
  value: unknown,
  path: string,
): CharacterRailSettings {
  const rail = requireRecord(value, path);
  return {
    enabled: requireBoolean(rail.enabled, `${path}.enabled`),
    x: requireNumber(rail.x, `${path}.x`, -10000, 10000),
    y: requireNumber(rail.y, `${path}.y`, -10000, 10000),
    width: requireNumber(rail.width, `${path}.width`, 1, 10000),
    height: requireNumber(rail.height, `${path}.height`, 1, 10000),
  };
}

function mergeDefaults(defaults: unknown, value: unknown): unknown {
  if (!isRecord(defaults) || !isRecord(value)) {
    return value === undefined ? defaults : value;
  }

  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      mergeDefaults(defaultValue, value[key]),
    ]),
  );
}

export function parseScoreboardSettings(value: unknown): ScoreboardSettings {
  const settings = requireRecord(value, "scoreboard");
  const canvas = requireRecord(settings.canvas, "scoreboard.canvas");
  const layout = requireRecord(settings.layout, "scoreboard.layout");
  const text = requireRecord(settings.text, "scoreboard.text");
  const elements = requireRecord(settings.elements, "scoreboard.elements");
  const round = requireRecord(elements.round, "scoreboard.elements.round");

  const parsed: ScoreboardSettings = {
    canvas: {
      width: requireNumber(
        canvas.width,
        "scoreboard.canvas.width",
        1,
        10000,
      ),
      height: requireNumber(
        canvas.height,
        "scoreboard.canvas.height",
        1,
        10000,
      ),
    },
    layout: {
      mirrorPlayerCards: requireBoolean(
        layout.mirrorPlayerCards,
        "scoreboard.layout.mirrorPlayerCards",
      ),
    },
    text: {
      fontFamily: requireString(
        text.fontFamily,
        "scoreboard.text.fontFamily",
        200,
      ),
      playerNameSize: requireNumber(
        text.playerNameSize,
        "scoreboard.text.playerNameSize",
        1,
        500,
      ),
      playerNameColor: requireString(
        text.playerNameColor,
        "scoreboard.text.playerNameColor",
        100,
      ),
      sponsorTagsEnabled: requireBoolean(
        text.sponsorTagsEnabled,
        "scoreboard.text.sponsorTagsEnabled",
      ),
      sponsorTagSize: requireNumber(
        text.sponsorTagSize,
        "scoreboard.text.sponsorTagSize",
        1,
        500,
      ),
      sponsorTagColor: requireString(
        text.sponsorTagColor,
        "scoreboard.text.sponsorTagColor",
        100,
      ),
      sponsorTagWeight: requireNumber(
        text.sponsorTagWeight,
        "scoreboard.text.sponsorTagWeight",
        100,
        900,
      ),
      sponsorTagSeparator: requireString(
        text.sponsorTagSeparator,
        "scoreboard.text.sponsorTagSeparator",
        20,
        true,
      ),
      sponsorTagSeparatorEnabled: requireBoolean(
        text.sponsorTagSeparatorEnabled,
        "scoreboard.text.sponsorTagSeparatorEnabled",
      ),
      playerFlagsEnabled: requireBoolean(
        text.playerFlagsEnabled,
        "scoreboard.text.playerFlagsEnabled",
      ),
      scoreSize: requireNumber(
        text.scoreSize,
        "scoreboard.text.scoreSize",
        1,
        500,
      ),
      scoreColor: requireString(
        text.scoreColor,
        "scoreboard.text.scoreColor",
        100,
      ),
      roundSize: requireNumber(
        text.roundSize,
        "scoreboard.text.roundSize",
        1,
        500,
      ),
      roundColor: requireString(
        text.roundColor,
        "scoreboard.text.roundColor",
        100,
      ),
    },
    elements: {
      player1: parsePlayerBlock(
        elements.player1,
        "scoreboard.elements.player1",
      ),
      player2: parsePlayerBlock(
        elements.player2,
        "scoreboard.elements.player2",
      ),
      player1Characters: parseCharacterRail(
        elements.player1Characters,
        "scoreboard.elements.player1Characters",
      ),
      player2Characters: parseCharacterRail(
        elements.player2Characters,
        "scoreboard.elements.player2Characters",
      ),
      round: {
        enabled: requireBoolean(
          round.enabled,
          "scoreboard.elements.round.enabled",
        ),
        x: requireNumber(
          round.x,
          "scoreboard.elements.round.x",
          -10000,
          10000,
        ),
        y: requireNumber(
          round.y,
          "scoreboard.elements.round.y",
          -10000,
          10000,
        ),
        width: requireNumber(
          round.width,
          "scoreboard.elements.round.width",
          1,
          10000,
        ),
        height: requireNumber(
          round.height,
          "scoreboard.elements.round.height",
          1,
          10000,
        ),
        background: parseBackground(
          round.background,
          "scoreboard.elements.round.background",
        ),
      },
    },
  };

  return applyPlayerCardSymmetry(parsed);
}

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

export function mergeScoreboardSettings(value: unknown): ScoreboardSettings {
  return parseScoreboardSettings(
    mergeDefaults(DEFAULT_SCOREBOARD_SETTINGS, value),
  );
}

export function patchScoreboardSettings(
  current: ScoreboardSettings,
  patch: unknown,
): ScoreboardSettings {
  requireRecord(patch, "scoreboardPatch");
  return parseScoreboardSettings(mergeDefaults(current, patch));
}
