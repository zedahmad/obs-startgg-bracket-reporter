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
