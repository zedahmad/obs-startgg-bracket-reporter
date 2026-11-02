export type BackgroundSettings = {
  startColor: string;
  endColor: string;
  angle: number;
  customCss: string;
};

export type PlayerBlockSettings = {
  x: number;
  y: number;
  width: number;
  height: number;
  scoreWidth: number;
  nameBackground: BackgroundSettings;
  scoreBackground: BackgroundSettings;
};

export type RoundBlockSettings = {
  x: number;
  y: number;
  width: number;
  height: number;
  background: BackgroundSettings;
};

export type ScoreboardSettings = {
  canvas: {
    width: number;
    height: number;
  };
  text: {
    fontFamily: string;
    playerNameSize: number;
    playerNameColor: string;
    scoreSize: number;
    scoreColor: string;
    roundSize: number;
    roundColor: string;
  };
  elements: {
    player1: PlayerBlockSettings;
    player2: PlayerBlockSettings;
    round: RoundBlockSettings;
  };
};
